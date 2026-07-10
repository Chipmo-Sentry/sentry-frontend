/** Browser-side API client. Cookies are sent automatically (httpOnly +
 * sameSite=lax from backend). For Server Components we use a separate fetch
 * with `cookies()` header forwarding. */

import type {
  AgentPublic,
  AlertLevel,
  AlertPublic,
  BehaviorConfig,
  BehaviorConfigPatch,
  CameraPublic,
  ClipPublic,
  DemographicsSummary,
  EventLogPublic,
  FloorPlan,
  FlowSummary,
  FootfallGrid,
  LoginResponse,
  OrganizationPublic,
  OrgRole,
  PairingCodePublic,
  PeakMatrix,
  StorePublic,
  TrafficSummary,
  UserPublic,
  ZoneBreakdown,
} from "./types";

// Default to "" so the browser only ever talks to THIS origin and the Next
// `/api/*` rewrite (see next.config.mjs) proxies to the backend server-side.
// That keeps the auth cookie same-origin (host-only) so SameSite=Lax works
// without a custom domain. Setting NEXT_PUBLIC_API_BASE_URL to an absolute
// cross-site host re-introduces the dropped-cookie bug — leave it empty in prod.
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/** A fetch that never threw an HTTP status (status 0) — i.e. the network
 * itself failed (offline, DNS, CORS). Surfaced to users in Mongolian instead
 * of the browser's raw English "Failed to fetch". */
const NETWORK_ERROR = "Сүлжээний алдаа. Холболтоо шалгаад дахин оролдоно уу.";

/** Read a backend `{detail}` error message, falling back to a Mongolian
 * default rather than the raw English HTTP statusText. */
async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string };
    if (body.detail) return body.detail;
  } catch {
    // body wasn't JSON
  }
  return "Алдаа гарлаа. Дахин оролдоно уу.";
}

// Single-flight access-token refresh, mirroring sentry-superadmin. The access
// cookie lives ~15 min; the refresh cookie ~7 days (Path=/api/v1/auth). Without
// this, once the access token expires while the tab stays open EVERY request
// starts 401-ing and pages show a raw English "Not authenticated" with no path
// back to login. On a 401 we refresh once (collapsing concurrent 401s) and
// retry; if refresh fails the session is truly over → bounce to /login.
let refreshInFlight: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BASE}/api/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/** Send the browser to the login page, preserving where we were so the user
 * lands back after re-auth. No-op during SSR. */
function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const next = window.location.pathname + window.location.search;
  if (window.location.pathname.startsWith("/login")) return;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<T> {
  const url = `${BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch {
    // fetch() rejects only on network failure, never on HTTP status.
    throw new ApiError(0, NETWORK_ERROR);
  }
  // Access token expired → refresh once and retry. Skip the auth endpoints
  // themselves so a failing refresh/login can't loop.
  if (res.status === 401 && !retried && !path.startsWith("/api/v1/auth/")) {
    if (await refreshAccessToken()) {
      return request<T>(path, init, true);
    }
    // Refresh failed — the session is genuinely over. Send them to login
    // rather than leaving every page stuck on an English 401 error.
    redirectToLogin();
  }
  if (!res.ok) {
    throw new ApiError(res.status, await errorDetail(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// === Auth ===

export const auth = {
  login: (email: string, password: string) =>
    request<LoginResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () =>
    request<void>("/api/v1/auth/logout", { method: "POST" }),
  me: () => request<UserPublic>("/api/v1/auth/me"),
};

// === Stores ===

export interface StoreInput {
  name: string;
  address?: string | null;
  timezone?: string;
  telegram_chat_id?: string | null;
}

export const stores = {
  list: () => request<StorePublic[]>("/api/v1/stores"),
  get: (id: string) => request<StorePublic>(`/api/v1/stores/${id}`),
  create: (body: StoreInput) =>
    request<StorePublic>("/api/v1/stores", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (id: string, body: Partial<StoreInput>) =>
    request<StorePublic>(`/api/v1/stores/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  remove: (id: string) =>
    request<void>(`/api/v1/stores/${id}`, { method: "DELETE" }),
  /** docs/30 floor plan (agent-authored, org-scoped read-only). Empty plan =
   * nothing drawn yet — the /insights viewport shows an empty state. */
  floorPlan: (id: string) =>
    request<FloorPlan>(`/api/v1/stores/${id}/floor-plan`),
  /** docs/30 F2 dwell heatmap: person-frame samples per plan grid-cell over the
   * last `hours` (default 24). Sparse — only non-zero cells returned. */
  footfall: (id: string, hours = 24) =>
    request<FootfallGrid>(
      `/api/v1/stores/${id}/analytics/footfall?hours=${hours}`,
    ),
  /** docs/30 F3 visitor traffic: hourly entries + peak over the last `hours`. */
  traffic: (id: string, hours = 24) =>
    request<TrafficSummary>(
      `/api/v1/stores/${id}/analytics/traffic?hours=${hours}`,
    ),
  /** docs/30 F4 zone breakdown: footfall attributed to each plan fixture. */
  zones: (id: string, hours = 24) =>
    request<ZoneBreakdown>(
      `/api/v1/stores/${id}/analytics/zones?hours=${hours}`,
    ),
  /** docs/30 F4 movement flow: busiest transitions between coarse plan cells. */
  flow: (id: string, hours = 24) =>
    request<FlowSummary>(
      `/api/v1/stores/${id}/analytics/flow?hours=${hours}`,
    ),
  /** docs/30 peak matrix: visitors by weekday × hour over the last `days`. */
  peak: (id: string, days = 28) =>
    request<PeakMatrix>(
      `/api/v1/stores/${id}/analytics/peak?days=${days}`,
    ),
  /** docs/30 F5 demographics: gender/age split of classified visitors. total=0
   * until the store's AI node runs a demographics classifier. */
  demographics: (id: string, hours = 24) =>
    request<DemographicsSummary>(
      `/api/v1/stores/${id}/analytics/demographics?hours=${hours}`,
    ),
};

// === Cameras ===

export interface CameraInput {
  store_id: string;
  name: string;
  rtsp_url?: string | null;
  stage2_threshold?: number;
  enabled?: boolean;
  mediamtx_path?: string | null;
  risk_threshold?: number;
}

export const cameras = {
  list: (storeId?: string) => {
    const suffix = storeId ? `?store_id=${encodeURIComponent(storeId)}` : "";
    return request<CameraPublic[]>(`/api/v1/cameras${suffix}`);
  },
  get: (id: string) => request<CameraPublic>(`/api/v1/cameras/${id}`),
  create: (body: CameraInput) =>
    request<CameraPublic>("/api/v1/cameras", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (id: string, body: Partial<Omit<CameraInput, "store_id">>) =>
    request<CameraPublic>(`/api/v1/cameras/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  remove: (id: string) =>
    request<void>(`/api/v1/cameras/${id}`, { method: "DELETE" }),
  /** Short-lived per-camera WHEP/HLS read token — append as `?jwt=<token>` to
   * the MediaMTX stream URL so playback is authenticated (not `user: any`). */
  streamToken: (id: string) =>
    request<{ token: string; expires_in: number; hls_url?: string | null }>(
      `/api/v1/cameras/${encodeURIComponent(id)}/stream-token`,
    ),
};

/** Absolute base for backend-served URLs (e.g. the live HLS proxy) so a <video>
 * src points at the API origin, not the frontend's. Empty when same-origin. */
export const API_BASE_URL = BASE;

// === Admin (super-admin only) ===

export interface UserInviteInput {
  email: string;
  password: string;
  organization_id: string;
  role: OrgRole;
  is_super_admin?: boolean;
}

export const admin = {
  listOrgs: () => request<OrganizationPublic[]>("/api/v1/admin/orgs"),
  createOrg: (body: { name: string; slug: string }) =>
    request<OrganizationPublic>("/api/v1/admin/orgs", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  inviteUser: (body: UserInviteInput) =>
    request<UserPublic>("/api/v1/admin/users", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

// === Org self-service (customer manages their OWN org's users) ===

export interface OrgMember {
  user: UserPublic;
  role: OrgRole;
}
export interface InviteResult {
  id: string;
  email: string;
  role: OrgRole;
  invite_url: string;
  emailed: boolean;
  expires_at: string;
}
export interface PendingInvite {
  id: string;
  email: string;
  role: OrgRole;
  expires_at: string;
  created_at: string;
}

export const org = {
  members: () => request<OrgMember[]>("/api/v1/org/members"),
  invitations: () => request<PendingInvite[]>("/api/v1/org/invitations"),
  invite: (body: { email: string; role: OrgRole }) =>
    request<InviteResult>("/api/v1/org/invitations", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  cancelInvite: (inviteId: string) =>
    request<void>(`/api/v1/org/invitations/${encodeURIComponent(inviteId)}`, {
      method: "DELETE",
    }),
  removeMember: (userId: string) =>
    request<void>(`/api/v1/org/members/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    }),
  setMemberActive: (userId: string, isActive: boolean) =>
    request<OrgMember>(`/api/v1/org/members/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: isActive }),
    }),
  acceptInvite: (body: { token: string; password: string }) =>
    request<UserPublic>("/api/v1/org/accept-invite", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

// === Agents (camera-relay PC pairing) ===

export const agents = {
  /** Generate a 6-digit pairing code for a store (admin/owner only). */
  createPairingCode: (storeId: string) =>
    request<PairingCodePublic>(
      `/api/v1/stores/${encodeURIComponent(storeId)}/pairing-codes`,
      { method: "POST" },
    ),
  listForStore: (storeId: string) =>
    request<AgentPublic[]>(
      `/api/v1/stores/${encodeURIComponent(storeId)}/agents`,
    ),
  revoke: (agentId: string) =>
    request<void>(`/api/v1/agents/${encodeURIComponent(agentId)}`, {
      method: "DELETE",
    }),
};

// === Clips ===

export const clips = {
  list: () => request<ClipPublic[]>("/api/v1/clips"),
  get: (id: string) => request<ClipPublic>(`/api/v1/clips/${id}`),
  /** Multipart upload — `fetch` strips Content-Type so the browser sets the
   * correct multipart boundary. */
  upload: async (params: {
    file: File;
    store_id: string;
    camera_id?: string;
    captured_at?: string;
    duration_sec?: number;
  }): Promise<ClipPublic> => {
    const fd = new FormData();
    fd.append("file", params.file);
    fd.append("store_id", params.store_id);
    if (params.camera_id) fd.append("camera_id", params.camera_id);
    if (params.captured_at) fd.append("captured_at", params.captured_at);
    fd.append("duration_sec", String(params.duration_sec ?? 0));

    let res: Response;
    try {
      res = await fetch(`${BASE}/api/v1/clips`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
    } catch {
      throw new ApiError(0, NETWORK_ERROR);
    }
    if (res.status === 401) redirectToLogin();
    if (!res.ok) {
      throw new ApiError(res.status, await errorDetail(res));
    }
    return (await res.json()) as ClipPublic;
  },
};

// === Alerts ===

export const alerts = {
  list: (params?: {
    min_level?: AlertLevel;
    store_id?: string;
    camera_id?: string;
    limit?: number;
    offset?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.min_level) q.set("min_level", params.min_level);
    if (params?.store_id) q.set("store_id", params.store_id);
    if (params?.camera_id) q.set("camera_id", params.camera_id);
    if (params?.limit !== undefined) q.set("limit", String(params.limit));
    if (params?.offset !== undefined) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q}` : "";
    return request<AlertPublic[]>(`/api/v1/alerts${suffix}`);
  },
  get: (id: string) => request<AlertPublic>(`/api/v1/alerts/${id}`),
};

// === Event / activity log (org-scoped timeline) ===

export interface EventListParams {
  event_type?: string[];
  severity?: string[];
  include_heartbeats?: boolean;
  before?: string; // ISO datetime cursor (created_at <)
  limit?: number;
  offset?: number;
}

function eventQuery(params?: EventListParams): string {
  const q = new URLSearchParams();
  params?.event_type?.forEach((t) => q.append("event_type", t));
  params?.severity?.forEach((s) => q.append("severity", s));
  if (params?.include_heartbeats) q.set("include_heartbeats", "true");
  if (params?.before) q.set("before", params.before);
  if (params?.limit !== undefined) q.set("limit", String(params.limit));
  if (params?.offset !== undefined) q.set("offset", String(params.offset));
  return q.toString() ? `?${q}` : "";
}

export const events = {
  list: (params?: EventListParams) =>
    request<EventLogPublic[]>(`/api/v1/events${eventQuery(params)}`),
  /** SSE endpoint URL — open with `new EventSource(url, { withCredentials: true })`
   * and listen for the `log` event. */
  streamUrl: () => `${BASE}/api/v1/events/stream`,
};

// === Feedback ===

export const feedback = {
  create: (params: {
    alert_id: string;
    verdict: "true_positive" | "false_positive" | "unclear";
    notes?: string;
  }) =>
    request("/api/v1/feedback", {
      method: "POST",
      body: JSON.stringify(params),
    }),
};

// === Billing (org wallet — T14) ===

export type BillingStatus = "active" | "credit" | "suspended";
export type JournalKind =
  | "topup"
  | "usage_charge"
  | "promo_credit"
  | "adjustment";
export type LedgerAccount = "cash" | "org_wallet" | "revenue" | "promo_expense";

export interface StoreBillingLine {
  store_id: string;
  name: string;
  active_cameras: number;
  /** null — дэлгүүрт идэвхтэй камер байхгүй (төлбөргүй). */
  tier: string | null;
  platform_fee_mnt: number;
  camera_fee_mnt: number;
  monthly_mnt: number;
}

export interface BillingSummary {
  balance_mnt: number;
  status: BillingStatus;
  credit_until: string | null;
  promo_free_until: string | null;
  daily_rate_mnt: number;
  monthly_rate_mnt: number;
  stores: StoreBillingLine[];
}

export interface JournalEntry {
  id: string;
  posted_at: string;
  kind: JournalKind;
  dr_account: LedgerAccount;
  cr_account: LedgerAccount;
  /** Always positive — direction comes from dr/cr (cr=org_wallet → орлого). */
  amount_mnt: number;
  description: string;
  charge_date: string | null;
  meta: Record<string, unknown> | null;
}

export interface PromoRedeemResult {
  code: string;
  kind: "bonus_amount" | "free_days";
  amount_mnt: number | null;
  free_days: number | null;
  balance_mnt: number;
  promo_free_until: string | null;
}

export const billing = {
  summary: () => request<BillingSummary>("/api/v1/billing"),
  journal: (params?: { limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params?.limit !== undefined) q.set("limit", String(params.limit));
    if (params?.offset !== undefined) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q}` : "";
    return request<JournalEntry[]>(`/api/v1/billing/journal${suffix}`);
  },
  redeemPromo: (code: string) =>
    request<PromoRedeemResult>("/api/v1/billing/promo", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
};

// === Behaviors ===

export const behaviors = {
  get: () => request<BehaviorConfig>("/api/v1/behaviors"),
  patch: (body: BehaviorConfigPatch) =>
    request<BehaviorConfig>("/api/v1/behaviors", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};

// === AI nodes (org-scoped health — Pipeline Canvas / Health) ===

/** VLM run history reported by the node heartbeat (event-driven). */
export interface NodeVlmActivity {
  count: number;
  last_ago_sec: number | null;
  last_latency_ms: number | null;
}

/** VLM model GPU residency on the node. */
export interface NodeVlmStatus {
  loaded: boolean;
  model: string | null;
  vram_mb: number | null;
  gpu_pct: number | null;
}

/** Per-camera stream health inside a node (status: ok = inferring, stalled =
 * worker alive but 0 FPS, error = worker dead / RTSP failure). */
export interface NodeCameraHealth {
  camera_id: string;
  fps: number | null;
  status: "ok" | "stalled" | "error";
}

/** Org-scoped, camera-PROJECTED node health. The backend returns only THIS
 * org's cameras out of a (possibly shared) node and never the raw telemetry
 * string — see backend schemas.ai_node.build_org_node. */
export interface OrgNodePublic {
  id: string;
  name: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  version: string | null;
  gpu: string | null;
  /** Desired provider (DB) vs effective (last heartbeat) → applied/applying. */
  provider: string;
  provider_effective: string | null;
  provider_ready: boolean | null;
  provider_error: string | null;
  breach_mode: string;
  breach_mode_effective: string | null;
  fps_inference: number | null;
  active_cameras: number | null;
  cpu_pct: number | null;
  ram_used_mb: number | null;
  ram_total_mb: number | null;
  gpu_pct: number | null;
  vram_used_mb: number | null;
  vram_total_mb: number | null;
  gpu_temp_c: number | null;
  vlm_activity: NodeVlmActivity | null;
  vlm: NodeVlmStatus | null;
  health: Record<string, boolean> | null;
  /** Filtered to the caller-org's cameras only. */
  cameras: NodeCameraHealth[];
}

/** One resource-telemetry sample (per heartbeat) for the node history charts. */
export interface NodeMetricSample {
  ts: string;
  cpu_pct: number | null;
  ram_used_mb: number | null;
  ram_total_mb: number | null;
  gpu_pct: number | null;
  vram_used_mb: number | null;
  vram_total_mb: number | null;
  gpu_temp_c: number | null;
  fps_inference: number | null;
  active_cameras: number | null;
  sentry_cpu_pct: number | null;
  sentry_ram_mb: number | null;
  sentry_vram_mb: number | null;
}

export type NodeMetricRange = "1h" | "6h" | "24h" | "7d" | "30d";

// --- Node diagnostics (stage-detail console — docs/26) ---

export interface NodeDiagWorker {
  camera_id: string;
  running: boolean;
  fps_capture: number;
  fps_inference: number;
  frames_total: number;
  detections_total: number;
  last_error: string | null;
}

/** One VLM run. `parsed=false` + `raw` = the model returned unparseable output
 * (the neutral-fallback case) — `raw` is the truncated text showing WHY. */
export interface NodeDiagVerdict {
  ts: number;
  category: string;
  confidence: number;
  latency_ms: number;
  frames_used: number;
  parsed: boolean;
  raw: string | null;
}

export interface NodeDiagVlm {
  provider_effective: string | null;
  provider_ready: boolean | null;
  provider_error: string | null;
  breach_mode: string;
  activity: { count: number; last_ago_sec: number | null; last_latency_ms: number | null };
  config: {
    num_predict: number;
    num_ctx: number;
    frames_per_clip: number;
    frame_max_dim: number;
    retry_on_parse_error: number;
  };
  parse_fail_pct: number | null;
  verdicts: NodeDiagVerdict[];
}

export interface NodeDiag {
  ts: number;
  version: string;
  yolo_model: string;
  workers: NodeDiagWorker[];
  vlm: NodeDiagVlm;
}

export interface NodeDiagResponse {
  available: boolean;
  age_sec: number | null;
  diag: NodeDiag | null;
}

/** One camera's ffmpeg push-relay state, reported by its store agent. Drives the
 * 'Камер' pipeline stage — a down relay surfaces the real reason (last_error). */
export interface AgentPushPath {
  path: string;
  running: boolean;
  restarts: number;
  last_error: string | null;
  agent_id: string;
  agent_name: string | null;
  agent_online: boolean;
}

export interface AgentPushStatusResponse {
  paths: AgentPushPath[];
}

export const nodes = {
  /** AI nodes that serve at least one of this org's cameras. */
  list: () => request<OrgNodePublic[]>("/api/v1/nodes"),
  /** Per-camera agent push-relay state (by mediamtx_path) across the org. */
  agentPush: () => request<AgentPushStatusResponse>("/api/v1/nodes/agent-push"),
  /** Resource time-series for a node the org owns (404 otherwise). */
  metrics: (id: string, range: NodeMetricRange = "24h") =>
    request<NodeMetricSample[]>(
      `/api/v1/nodes/${encodeURIComponent(id)}/metrics?range=${range}`,
    ),
  /** Latest rich per-stage diagnostics the node pushed (worker errors, VLM
   * verdicts + raw-on-failure). 404 for an unowned node. */
  diag: (id: string) =>
    request<NodeDiagResponse>(`/api/v1/nodes/${encodeURIComponent(id)}/diag`),
};

// === Cloud ingest (MediaMTX runtime path state — Pipeline Canvas stage 2) ===

/** Runtime publish state of one camera's cloud stream. `ready` = a publisher is
 * active and video is arriving at the cloud ingest right now. */
export interface IngestPath {
  path: string;
  name: string;
  ready: boolean;
  readers: number;
}

/** `available=false` ⇒ MediaMTX control API not configured/unreachable, so the
 * canvas shows stage 2 as "unknown" rather than a fake "0 ready". */
export interface IngestPathsResponse {
  available: boolean;
  paths: IngestPath[];
}

export const ingest = {
  /** Cloud-ingest publish state for THIS org's camera paths. */
  paths: () => request<IngestPathsResponse>("/api/v1/ingest/paths"),
};

export { ApiError };
