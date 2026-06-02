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
  LoginResponse,
  OrganizationPublic,
  OrgRole,
  PairingCodePublic,
  StorePublic,
  UserPublic,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, detail);
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
};

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

    const res = await fetch(`${BASE}/api/v1/clips`, {
      method: "POST",
      body: fd,
      credentials: "include",
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = (await res.json()) as { detail?: string };
        if (body.detail) detail = body.detail;
      } catch {
        // ignore
      }
      throw new ApiError(res.status, detail);
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

// === Behaviors ===

export const behaviors = {
  get: () => request<BehaviorConfig>("/api/v1/behaviors"),
  patch: (body: BehaviorConfigPatch) =>
    request<BehaviorConfig>("/api/v1/behaviors", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};

export { ApiError };
