/** Manually-curated types matching sentry-backend Pydantic schemas.
 *
 * TODO Session 2: replace with `openapi-typescript` codegen from
 * sentry-backend/openapi.json. For M1 the schema is small enough to hand-write. */

export type UUID = string;
export type ISODateTime = string;

// === Auth ===

export interface UserPublic {
  id: UUID;
  email: string;
  is_super_admin: boolean;
  is_active: boolean;
  created_at: ISODateTime;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
}

export interface LoginResponse {
  user: UserPublic;
  tokens: TokenPair;
}

// === Domain ===

export interface StorePublic {
  id: UUID;
  organization_id: UUID;
  name: string;
  address: string | null;
  timezone: string;
  created_at: ISODateTime;
}

export interface CameraPublic {
  id: UUID;
  store_id: UUID;
  name: string;
  shelf_zone_json: Record<string, unknown> | null;
  stage2_threshold: number;
  enabled: boolean;
  has_rtsp_url: boolean;
  created_at: ISODateTime;
  mediamtx_path: string | null;
  risk_threshold: number;
}

// === Org / admin (super-admin scope) ===

export type OrgRole = "owner" | "admin" | "staff";

export interface OrganizationPublic {
  id: UUID;
  name: string;
  slug: string;
  created_at: ISODateTime;
}

export interface ClipPublic {
  id: UUID;
  organization_id: UUID;
  store_id: UUID | null;
  camera_id: UUID | null;
  captured_at: ISODateTime;
  received_at: ISODateTime;
  duration_sec: number;
  file_size_bytes: number;
  sha256: string;
  created_at: ISODateTime;
}

export type AlertCategory =
  | "browsing"
  | "cart_pickup"
  | "pocket_conceal"
  | "other";

export type AlertLevel = "ignore" | "log" | "notify" | "review";

export interface AlertPublic {
  id: UUID;
  clip_id: UUID;
  organization_id: UUID;
  store_id: UUID | null;
  camera_id: UUID | null;
  category: AlertCategory;
  confidence: number;
  reasoning: string;
  model_name: string;
  alert_level: AlertLevel;
  inference_latency_ms: number;
  created_at: ISODateTime;
}

export type FeedbackVerdict = "true_positive" | "false_positive" | "unclear";

export interface FeedbackPublic {
  id: UUID;
  alert_id: UUID;
  user_id: UUID;
  verdict: FeedbackVerdict;
  notes: string | null;
  created_at: ISODateTime;
}
