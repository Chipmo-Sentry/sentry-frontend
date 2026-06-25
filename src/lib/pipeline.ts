/** Pure per-camera pipeline status derivation, shared by the Pipeline Canvas
 * matrix and the per-stage detail pages. No React, no JSX. */

import type {
  AgentPushPath,
  IngestPathsResponse,
  NodeCameraHealth,
  OrgNodePublic,
} from "./api";
import { CATEGORY_LABEL, LEVEL_LABEL } from "./labels";
import type { Track } from "./live-ws";
import type { AlertPublic } from "./types";

export type StageKey = "camera" | "ingest" | "yolo" | "tracker" | "vlm" | "decision";
export type CellStatus = "ok" | "warn" | "down" | "unknown";

export type LiveCamera = { id: string; path: string; name: string };

/** Live signal one camera contributes (also produced by CameraSignal). */
export type CameraSig = {
  connected: boolean;
  fps: number;
  trackCount: number;
  counts: { green: number; yellow: number; red: number };
  maxRisk: number;
  maxColor: "green" | "yellow" | "red" | null;
  lastFrameAt: number | null;
};

export const STAGE_ORDER: StageKey[] = [
  "camera",
  "ingest",
  "yolo",
  "tracker",
  "vlm",
  "decision",
];

export const STAGE_LABEL: Record<StageKey, string> = {
  camera: "Камер",
  ingest: "Cloud ingest",
  yolo: "YOLO",
  tracker: "Tracker + дүрэм",
  vlm: "VLM",
  decision: "Шийдвэр",
};

export const STAGE_PROCESS: Record<StageKey, string> = {
  camera: "Камераас RTSP татаж үүл рүү түлхэх",
  ingest: "Үүлэн MediaMTX-д публиш хүлээн авах",
  yolo: "Хүн / объект таних (YOLO)",
  tracker: "Мөшгих + дүрмээр эрсдэл (0–100)",
  vlm: "Clip-ийг VLM-ээр шинжлэх",
  decision: "Сэрэмжлүүлэг / бүртгэл шийдвэр",
};

export const STATUS_LABEL: Record<CellStatus, string> = {
  ok: "Хэвийн",
  warn: "Анхаар",
  down: "Тасарсан",
  unknown: "Тайлагнаагүй",
};

export const FRESH_MS = 6000; // a frame within 6s ⇒ flowing
export const STARVE_SEC = 20; // VLM last-run age beyond this (+red people) ⇒ starved

/** Status → CSS theme var (shared by canvas, matrix, detail pages). */
export const STATUS_COLOR: Record<CellStatus, string> = {
  ok: "var(--color-success)",
  warn: "var(--color-warning)",
  down: "var(--color-danger)",
  unknown: "var(--color-muted-foreground)",
};

/** Risk ramp — must match LiveCameraTile's bounding-box colors. */
export const RISK_HEX = { green: "#22c55e", yellow: "#eab308", red: "#ef4444" } as const;

export type StageCell = {
  status: CellStatus;
  short: string;
  /** Plain-Mongolian diagnosis when the stage is degraded (table detail / tooltip). */
  reason?: string;
};

export type CameraRow = {
  cam: LiveCamera;
  node: OrgNodePublic | null;
  health: NodeCameraHealth | null;
  cells: Record<StageKey, StageCell>;
};

/** The AI node serving a camera (matched by mediamtx_path) + that camera's health row. */
export function cameraNode(
  path: string,
  nodes: OrgNodePublic[],
): { node: OrgNodePublic; health: NodeCameraHealth | null } | null {
  for (const n of nodes) {
    const h = n.cameras.find((c) => c.camera_id === path);
    if (h) return { node: n, health: h };
  }
  return null;
}

function cameraCell(
  sig: CameraSig | undefined,
  push: AgentPushPath | undefined,
  now: number,
): StageCell {
  // The 'Камер' stage IS "pull RTSP from the camera → push to the cloud", which is
  // the store agent's job. When the agent reports this relay, it's the source of
  // truth for WHY the stage is down (the real ffmpeg error), so it wins over the
  // downstream WS frame signal. Cameras with no agent push (pull/on-LAN topology,
  // older agent) fall back to the WS-based freshness check below.
  if (push) {
    if (!push.agent_online)
      return {
        status: "down",
        short: "агент офлайн",
        reason: "Камерын агент (Store PC) холбогдохгүй байна",
      };
    if (!push.running)
      return {
        status: "down",
        short: "push тасарсан",
        reason: push.last_error
          ? `Агент push тасарсан — ${push.last_error}`
          : "Агент үүл рүү push хийхгүй байна (камер дамжуулахгүй)",
      };
  }
  if (!sig) return push ? { status: "ok", short: "push OK" } : { status: "unknown", short: "—" };
  if (!sig.connected) return { status: "down", short: "холбогдоогүй", reason: "WS холболт алга" };
  const fresh = sig.lastFrameAt != null && now - sig.lastFrameAt < FRESH_MS;
  if (!fresh)
    return { status: "warn", short: "кадр зогссон", reason: "WS холбоотой ч кадр ирэхгүй байна" };
  return { status: "ok", short: "урсаж байна" };
}

function ingestCell(path: string, ingest: IngestPathsResponse | null): StageCell {
  if (!ingest || !ingest.available)
    return { status: "unknown", short: "—", reason: "MediaMTX API хүрэхгүй" };
  const p = ingest.paths.find((x) => x.path === path);
  if (!p)
    return { status: "down", short: "зам алга", reason: "Энэ камерын зам MediaMTX дээр алга" };
  if (!p.ready)
    return {
      status: "down",
      short: "publisher алга",
      reason: "Агент үүл рүү публиш хийхгүй байна (камер дамжуулахгүй)",
    };
  return { status: "ok", short: `${p.readers} reader` };
}

function yoloCell(
  node: OrgNodePublic | null,
  health: NodeCameraHealth | null,
): StageCell {
  if (!node) return { status: "unknown", short: "—", reason: "Энэ камерыг үйлчлэх node алга" };
  if (!node.is_online)
    return { status: "down", short: "node офлайн", reason: `${node.name ?? "Node"} офлайн` };
  if (!health) return { status: "unknown", short: "—" };
  const fps = health.fps != null ? `${health.fps.toFixed(1)} fps` : "—";
  if (health.status === "ok") return { status: "ok", short: fps };
  if (health.status === "stalled")
    return { status: "warn", short: "кадргүй", reason: "Worker амьд ч 0 fps — кадр ирэхгүй" };
  return { status: "down", short: "RTSP алдаа", reason: "Worker унтарсан / RTSP уншиж чадахгүй" };
}

function trackerCell(sig: CameraSig | undefined): StageCell {
  if (!sig || !sig.connected) return { status: "unknown", short: "—" };
  const risk = sig.maxRisk > 0 ? ` · ${Math.round(sig.maxRisk)}%` : "";
  return { status: "ok", short: `${sig.trackCount} хүн${risk}` };
}

function vlmCell(
  node: OrgNodePublic | null,
  sig: CameraSig | undefined,
): StageCell {
  if (!node) return { status: "unknown", short: "—" };
  if (!node.is_online)
    return { status: "down", short: "node офлайн", reason: `${node.name ?? "Node"} офлайн` };
  if (node.provider_ready === false || node.provider_error)
    return {
      status: "down",
      short: "VLM бэлэн бус",
      reason: node.provider_error ?? "VLM провайдер бэлэн биш",
    };
  const lastAgo = node.vlm_activity?.last_ago_sec ?? null;
  const redPresent = (sig?.counts.red ?? 0) > 0;
  if (redPresent && lastAgo != null && lastAgo > STARVE_SEC)
    return {
      status: "warn",
      short: "GPU дүүрсэн",
      reason: `Улаан эрсдэлтэй хүн байхад VLM ${lastAgo}с шалгаагүй`,
    };
  return { status: "ok", short: lastAgo != null ? `${lastAgo}с өмнө` : "хүлээгдэж" };
}

function decisionCell(camId: string, alerts: AlertPublic[], now: number): StageCell {
  const mine = alerts.filter((a) => a.camera_id === camId);
  const lastHour = mine.filter((a) => now - new Date(a.created_at).getTime() < 3600_000).length;
  const last = mine[0];
  if (!last) return { status: "ok", short: "—" };
  return {
    status: "ok",
    short: `${lastHour}/цаг · ${CATEGORY_LABEL[last.category]}`,
    reason: `Сүүлийнх: ${CATEGORY_LABEL[last.category]} (${LEVEL_LABEL[last.alert_level]})`,
  };
}

/** Per-camera status at every stage — the backbone of the matrix + detail pages. */
export function computeCameraRows(
  cams: LiveCamera[],
  signals: Record<string, CameraSig>,
  nodes: OrgNodePublic[],
  ingest: IngestPathsResponse | null,
  alerts: AlertPublic[],
  now: number,
  push: Record<string, AgentPushPath> = {},
): CameraRow[] {
  return cams.map((cam) => {
    const sig = signals[cam.path];
    const cn = cameraNode(cam.path, nodes);
    const node = cn?.node ?? null;
    const health = cn?.health ?? null;
    return {
      cam,
      node,
      health,
      cells: {
        camera: cameraCell(sig, push[cam.path], now),
        ingest: ingestCell(cam.path, ingest),
        yolo: yoloCell(node, health),
        tracker: trackerCell(sig),
        vlm: vlmCell(node, sig),
        decision: decisionCell(cam.id, alerts, now),
      },
    };
  });
}

/** Reduce a frame's tracks + connection state into one camera's signal. Shared
 * by the CameraSignal probe (canvas/matrix) and the single-camera lane. */
export function deriveCameraSig(
  tracks: Track[],
  connected: boolean,
  fps: number,
  lastFrameAt: number | null,
): CameraSig {
  const counts = { green: 0, yellow: 0, red: 0 };
  let maxRisk = 0;
  let maxColor: CameraSig["maxColor"] = null;
  for (const t of tracks) {
    counts[t.color] += 1;
    if (t.risk_pct >= maxRisk) {
      maxRisk = t.risk_pct;
      maxColor = t.color;
    }
  }
  return { connected, fps, trackCount: tracks.length, counts, maxRisk, maxColor, lastFrameAt };
}

/** Worst status across a set of cells — for a stage's overall header. */
export function worstStatus(statuses: CellStatus[]): CellStatus {
  if (statuses.includes("down")) return "down";
  if (statuses.includes("warn")) return "warn";
  if (statuses.includes("ok")) return "ok";
  return "unknown";
}
