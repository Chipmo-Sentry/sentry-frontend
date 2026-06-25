"use client";

import { EmptyState, ErrorState, Spinner } from "@chipmo-sentry/ui-kit";
import {
  AlertTriangle,
  Bell,
  Brain,
  Cctv,
  ChevronRight,
  CloudUpload,
  Cpu,
  Route,
  ScanEye,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import type { IngestPathsResponse, OrgNodePublic } from "@/lib/api";
import { CATEGORY_LABEL, LEVEL_LABEL } from "@/lib/labels";
import {
  computeCameraRows,
  FRESH_MS,
  RISK_HEX,
  STARVE_SEC,
  STATUS_COLOR,
  type LiveCamera,
} from "@/lib/pipeline";
import { relativeTime } from "@/lib/time";
import type { AlertPublic } from "@/lib/types";

import { CameraMatrix } from "./CameraMatrix";
import { CameraSignal, type CameraSig } from "./CameraSignal";
import { HealthDot } from "./ui";
import { usePipelineData } from "./usePipelineData";

type Status = "ok" | "warn" | "down" | "unknown";
type Provenance = "live" | "heartbeat" | "unknown";

export function PipelineCanvas() {
  const {
    cams,
    error,
    reload,
    nodeList,
    ingest,
    push,
    signals,
    onReport,
    alerts,
    sseConnected,
    now,
  } = usePipelineData();

  const view = useMemo(
    () => computeView(cams ?? [], signals, nodeList, ingest, alerts, sseConnected, now),
    [cams, signals, nodeList, ingest, alerts, sseConnected, now],
  );
  const cameraRows = useMemo(
    () => computeCameraRows(cams ?? [], signals, nodeList, ingest, alerts, now, push),
    [cams, signals, nodeList, ingest, alerts, now, push],
  );

  if (error) {
    return (
      <div className="p-8">
        <ErrorState message={error} onRetry={reload} />
      </div>
    );
  }
  if (cams === null) {
    return (
      <div className="p-8">
        <Spinner label="Уншиж байна…" />
      </div>
    );
  }
  if (cams.length === 0) {
    return (
      <div className="p-8">
        <EmptyState
          icon={Cctv}
          title="Идэвхтэй камер алга"
          description="Урсгалыг хянахын тулд идэвхтэй, MediaMTX замтай камер бүртгэнэ үү."
          action={
            <Link
              href="/cameras"
              className="rounded-[var(--radius)] bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-[var(--color-primary-foreground)]"
            >
              Камер удирдах
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {/* Hidden per-camera WS probes feeding the live aggregate */}
      <div className="hidden">
        {cams.map((c) => (
          <CameraSignal key={c.path} path={c.path} onReport={onReport} />
        ))}
      </div>

      <GlobalHealthBanner banner={view.banner} />

      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
        <span className="inline-flex items-center gap-1.5">
          <Cctv className="h-3.5 w-3.5" aria-hidden />
          {view.stages[0]?.metric}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5" aria-hidden />
          {nodeList.length} node
        </span>
        <span className="ml-auto inline-flex items-center gap-2">
          <ConnDot ok={sseConnected} label="Сэрэмжлүүлэг" />
        </span>
      </div>

      {/* Centerpiece: the 6-stage wired flow graph */}
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-[680px] items-stretch">
          {view.stages.map((s, i) => (
            <div key={s.key} className="flex flex-1 items-stretch">
              <StageCard stage={s} />
              {i < view.stages.length - 1 && view.edges[i] && (
                <FlowEdge edge={view.edges[i] as EdgeState} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
        <DecisionFeed alerts={alerts} />
        <NodeStrip nodes={nodeList} />
      </div>

      <CameraMatrix rows={cameraRows} />
    </div>
  );
}

// ============================ derivation ============================

type StageView = {
  key: string;
  label: string;
  icon: typeof Cctv;
  metric: string;
  sub?: string;
  status: Status;
  provenance: Provenance;
  href?: string;
  /** What this stage does (table column "Үйл явц"). */
  process: string;
  /** This stage's live output (table column "Үр дүн"). */
  result: string;
};
type EdgeState =
  | "flow"
  | "down"
  | "unknown"
  | "idle"
  | "starve"
  | "off"
  | "risk-green"
  | "risk-yellow"
  | "risk-red";
type BannerView = { tone: Status; text: string } | null;

function computeView(
  cams: LiveCamera[],
  signals: Record<string, CameraSig>,
  nodeList: OrgNodePublic[],
  ingest: IngestPathsResponse | null,
  alerts: AlertPublic[],
  sseConnected: boolean,
  now: number,
) {
  const total = cams.length;
  let flowing = 0;
  let connectedCount = 0;
  let persons = 0;
  let red = 0;
  let yellow = 0;
  let topRisk = 0;
  let topColor: "green" | "yellow" | "red" | null = null;
  for (const c of cams) {
    const sig = signals[c.path];
    if (!sig) continue;
    if (sig.connected) connectedCount += 1;
    const fresh = sig.lastFrameAt != null && now - sig.lastFrameAt < FRESH_MS;
    if (sig.connected && fresh) flowing += 1;
    persons += sig.trackCount;
    red += sig.counts.red;
    yellow += sig.counts.yellow;
    if (sig.maxRisk >= topRisk) {
      topRisk = sig.maxRisk;
      topColor = sig.maxColor;
    }
  }

  const onlineNodes = nodeList.filter((n) => n.is_online);
  const totalFps = nodeList.reduce((a, n) => a + (n.fps_inference ?? 0), 0);
  const activeCams = nodeList.reduce((a, n) => a + (n.active_cameras ?? 0), 0);
  const providerErr = onlineNodes.find((n) => n.provider_error)?.provider_error ?? null;
  const providerNotReady = onlineNodes.some((n) => n.provider_ready === false);
  // Most-recent VLM run across online nodes (smallest last_ago_sec).
  let lastAgo: number | null = null;
  let lastLatency: number | null = null;
  for (const n of onlineNodes) {
    const a = n.vlm_activity?.last_ago_sec;
    if (a != null && (lastAgo === null || a < lastAgo)) {
      lastAgo = a;
      lastLatency = n.vlm_activity?.last_latency_ms ?? null;
    }
  }
  const breachOff = onlineNodes.length > 0 && onlineNodes.every((n) => n.breach_mode_effective === "off");
  const starved =
    red > 0 && !providerNotReady && lastAgo != null && lastAgo > STARVE_SEC;

  // Stage 1 — camera / RTSP
  const s1: Status =
    total === 0 ? "unknown" : flowing === 0 ? "down" : flowing < total ? "warn" : "ok";
  // Stage 3 — YOLO (heartbeat)
  const s3: Status =
    nodeList.length === 0
      ? "unknown"
      : onlineNodes.length === 0
        ? "down"
        : totalFps > 0
          ? "ok"
          : "warn";
  // Stage 4 — tracker + rules (live)
  const s4: Status = total === 0 ? "unknown" : flowing > 0 ? "ok" : "down";
  // Stage 5 — VLM (heartbeat)
  const s5: Status =
    nodeList.length === 0
      ? "unknown"
      : providerErr || providerNotReady
        ? "down"
        : starved
          ? "warn"
          : "ok";
  // Stage 2 — cloud ingest (MediaMTX runtime path state). available=false ⇒
  // unknown (honest), never a fake "0 ready".
  const ingestAvail = ingest?.available ?? false;
  const readyCount = ingest?.paths.filter((p) => p.ready).length ?? 0;
  const ingestTotal = ingest?.paths.length ?? total;
  const s2: Status = !ingestAvail
    ? "unknown"
    : ingestTotal === 0
      ? "unknown"
      : readyCount === 0
        ? "down"
        : readyCount < ingestTotal
          ? "warn"
          : "ok";
  // Stage 6 — decision (live SSE)
  const s6: Status = sseConnected ? "ok" : "warn";

  const lastHour = alerts.filter(
    (a) => now - new Date(a.created_at).getTime() < 3600_000,
  ).length;
  const lastAlert = alerts[0] ?? null;
  const lastVerdict = lastAlert
    ? `${CATEGORY_LABEL[lastAlert.category]} · ${Math.round(lastAlert.confidence * 100)}%`
    : null;

  const stages: StageView[] = [
    {
      key: "camera",
      label: "Камер",
      icon: Cctv,
      metric: `${flowing}/${total} урсаж`,
      sub: connectedCount < total ? `${total - connectedCount} холбогдоогүй` : undefined,
      status: s1,
      provenance: "live",
      href: "/pipeline/stage/camera",
      process: "Камераас RTSP татаж үүл рүү түлхэх",
      result: `${flowing}/${total} камер дамжуулж байна`,
    },
    {
      key: "ingest",
      label: "Cloud ingest",
      icon: CloudUpload,
      metric: ingestAvail ? `${readyCount}/${ingestTotal} ирж байна` : "тайлагнаагүй",
      sub: ingestAvail
        ? readyCount < ingestTotal
          ? `${ingestTotal - readyCount} зам хүлээгдэж`
          : undefined
        : "эх дохио алга",
      status: s2,
      provenance: ingestAvail ? "live" : "unknown",
      href: "/pipeline/stage/ingest",
      process: "Үүлэн MediaMTX-д публиш хүлээн авах",
      result: ingestAvail ? `${readyCount}/${ingestTotal} зам идэвхтэй` : "тайлагнаагүй",
    },
    {
      key: "yolo",
      label: "YOLO",
      icon: ScanEye,
      metric: nodeList.length ? `${totalFps.toFixed(1)} fps` : "тайлагнаагүй",
      sub: nodeList.length ? `${activeCams} идэвхтэй` : undefined,
      status: s3,
      provenance: nodeList.length ? "heartbeat" : "unknown",
      href: "/pipeline/stage/yolo",
      process: "Хүн / объект таних (YOLO)",
      result: nodeList.length ? `${totalFps.toFixed(1)} fps · ${activeCams} камер` : "тайлагнаагүй",
    },
    {
      key: "rules",
      label: "Tracker + дүрэм",
      icon: Route,
      metric: `${persons} хүн`,
      sub: red || yellow ? `${red} улаан · ${yellow} шар` : undefined,
      status: s4,
      provenance: "live",
      href: "/pipeline/stage/tracker",
      process: "Мөшгих + дүрмээр эрсдэл (0–100)",
      result: `${persons} хүн${topRisk > 0 ? ` · дээд эрсдэл ${Math.round(topRisk)}%` : ""}`,
    },
    {
      key: "vlm",
      label: "VLM",
      icon: Brain,
      metric: starved
        ? "шалгалт зогссон"
        : lastAgo != null
          ? `${lastAgo}с өмнө`
          : nodeList.length
            ? "хүлээгдэж"
            : "тайлагнаагүй",
      sub: starved
        ? "GPU дүүрсэн"
        : lastLatency != null
          ? `${(lastLatency / 1000).toFixed(1)}с`
          : providerErr ?? undefined,
      status: s5,
      provenance: nodeList.length ? "heartbeat" : "unknown",
      href: "/pipeline/stage/vlm",
      process: "Clip-ийг VLM-ээр шинжлэх",
      result:
        lastVerdict ??
        (starved ? "GPU дүүрсэн" : lastAgo != null ? `сүүлд ${lastAgo}с өмнө` : "хүлээгдэж"),
    },
    {
      key: "decision",
      label: "Шийдвэр",
      icon: Bell,
      metric: `${lastHour} / цаг`,
      sub: breachOff ? "хяналт ассан" : undefined,
      status: s6,
      provenance: "live",
      href: "/pipeline/stage/decision",
      process: "Сэрэмжлүүлэг / бүртгэл шийдвэр",
      result: `${lastHour} сэрэмжлүүлэг/цаг${lastAlert ? ` · ${LEVEL_LABEL[lastAlert.alert_level]}` : ""}`,
    },
  ];

  // Connectors (5): localize the break.
  const edges: EdgeState[] = [
    s1 === "down" ? "down" : s2 === "down" ? "down" : s2 === "unknown" ? "unknown" : "flow", // 1→2
    s2 === "unknown" ? "unknown" : s2 === "down" ? "down" : s3 === "down" ? "down" : "flow", // 2→3
    s3 === "down" ? "down" : topColor ? riskEdge(topColor) : s3 === "ok" ? "flow" : "idle", // 3→4
    s5 === "down" ? "down" : topColor ? riskEdge(topColor) : "flow", // 4→5
    breachOff ? "off" : starved ? "starve" : s5 === "down" ? "down" : s6 === "ok" ? "flow" : "idle", // 5→6
  ];

  // Banner — single most-severe issue, naming the hop.
  let banner: BannerView = null;
  const offlineWithCams = nodeList.filter((n) => !n.is_online && n.cameras.length > 0);
  const darkCams = offlineWithCams.reduce((a, n) => a + n.cameras.length, 0);
  const firstOffline = offlineWithCams[0];
  if (firstOffline) {
    const nm = firstOffline.name ?? "AI node";
    const age = firstOffline.last_seen_at
      ? relativeTime(firstOffline.last_seen_at, now)
      : "удсан";
    banner = { tone: "down", text: `${nm} офлайн (${age}) — ${darkCams} камер харанхуй` };
  } else if (starved) {
    banner = {
      tone: "warn",
      text: `GPU дүүрсэн — VLM шалгалт ${lastAgo}с зогссон · ${red} улаан хүн хүлээгдэж байна`,
    };
  } else if (providerErr || providerNotReady) {
    banner = { tone: "down", text: `VLM бэлэн биш${providerErr ? `: ${providerErr}` : ""}` };
  } else if (s2 === "down" && s1 !== "down") {
    banner = {
      tone: "down",
      text: `Камер дамжуулж байна ч үүл хүлээж авахгүй байна (${readyCount}/${ingestTotal} зам)`,
    };
  } else if (s1 === "down") {
    banner = { tone: "down", text: `${total} камер тасарсан — урсгал зогссон` };
  } else if (s1 === "warn") {
    banner = { tone: "warn", text: `${total - flowing} камер урсахгүй байна` };
  } else if (breachOff) {
    banner = { tone: "warn", text: "Хяналтын горим — AI ажиллаж байгаа ч сэрэмжлүүлэг үүсгэхгүй" };
  } else if (total > 0 && flowing === total) {
    banner = { tone: "ok", text: "Бүх шат хэвийн ажиллаж байна" };
  }

  return { stages, edges, banner };
}

function riskEdge(color: "green" | "yellow" | "red"): EdgeState {
  return `risk-${color}` as EdgeState;
}

// ============================ presentational ============================

const PROV_LABEL: Record<Provenance, string> = {
  live: "шууд",
  heartbeat: "heartbeat ~60с",
  unknown: "тайлагнаагүй",
};

function StageCard({ stage }: { stage: StageView }) {
  const color = STATUS_COLOR[stage.status];
  const Icon = stage.icon;
  const body = (
    <div
      className="flex h-full flex-col items-center gap-1 rounded-[var(--radius)] border bg-[var(--color-surface)] px-2 py-2.5 text-center transition-colors hover:bg-[var(--color-muted)]"
      style={{ borderColor: stage.status === "unknown" ? "var(--color-border)" : color }}
    >
      <Icon className="h-5 w-5" style={{ color }} aria-hidden />
      <span className="text-xs font-medium text-[var(--color-foreground)]">{stage.label}</span>
      <span className="text-[11px] text-[var(--color-muted-foreground)]">{stage.metric}</span>
      {stage.sub && (
        <span
          className="text-[10px]"
          style={{ color: stage.status === "warn" || stage.status === "down" ? color : "var(--color-muted-foreground)" }}
        >
          {stage.sub}
        </span>
      )}
      <span className="mt-1 inline-flex items-center gap-1">
        <HealthDot status={stage.status} />
        <span className="text-[9px] text-[var(--color-muted-foreground)]">
          {PROV_LABEL[stage.provenance]}
        </span>
      </span>
    </div>
  );
  if (stage.href) {
    return (
      <Link href={stage.href} className="block min-w-[96px] flex-1" title={`${stage.label} — дэлгэрэнгүй`}>
        {body}
      </Link>
    );
  }
  return <div className="min-w-[96px] flex-1">{body}</div>;
}

function FlowEdge({ edge }: { edge: EdgeState }) {
  const map: Record<EdgeState, { color: string; dashed: boolean }> = {
    flow: { color: "var(--color-primary)", dashed: false },
    idle: { color: "var(--color-muted-foreground)", dashed: false },
    down: { color: "var(--color-danger)", dashed: true },
    unknown: { color: "var(--color-muted-foreground)", dashed: true },
    starve: { color: "var(--color-warning)", dashed: true },
    off: { color: "var(--color-muted-foreground)", dashed: true },
    "risk-green": { color: RISK_HEX.green, dashed: false },
    "risk-yellow": { color: RISK_HEX.yellow, dashed: false },
    "risk-red": { color: RISK_HEX.red, dashed: false },
  };
  const { color, dashed } = map[edge];
  return (
    <div className="flex w-5 shrink-0 items-center justify-center self-center" aria-hidden>
      <div className="flex items-center" style={{ color }}>
        <span
          className="block h-px w-2"
          style={{
            borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}`,
          }}
        />
        <ChevronRight className="h-3.5 w-3.5" />
      </div>
    </div>
  );
}

function GlobalHealthBanner({ banner }: { banner: BannerView }) {
  if (!banner) return null;
  const tone = banner.tone;
  const color = STATUS_COLOR[tone];
  const Icon = tone === "ok" ? Bell : AlertTriangle;
  return (
    <div
      className="flex items-center gap-2 rounded-[var(--radius)] border px-3 py-2 text-sm"
      style={{
        borderColor: color,
        background: tone === "ok" ? "transparent" : "color-mix(in srgb, " + color + " 12%, transparent)",
        color,
      }}
      role="status"
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span>{banner.text}</span>
    </div>
  );
}

function ConnDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: ok ? "var(--color-success)" : "var(--color-warning)" }}
        aria-hidden
      />
      {label}
    </span>
  );
}

function DecisionFeed({ alerts }: { alerts: AlertPublic[] }) {
  const recent = alerts.slice(0, 6);
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
        Шийдвэрийн урсгал
      </h2>
      {recent.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-4 text-sm text-[var(--color-muted-foreground)]">
          Энэ session-д сэрэмжлүүлэг алга.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {recent.map((a) => (
            <li key={a.id}>
              <Link
                href={`/alerts/${a.id}`}
                className="flex items-center gap-2.5 rounded-[var(--radius)] border-l-2 bg-[var(--color-surface)] px-3 py-2 transition-colors hover:bg-[var(--color-muted)]"
                style={{ borderLeftColor: levelColor(a.alert_level) }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-[var(--color-foreground)]">
                    {CATEGORY_LABEL[a.category]}
                    <span className="text-[var(--color-muted-foreground)]">
                      {" "}
                      · {Math.round(a.confidence * 100)}%
                    </span>
                  </p>
                  <p className="truncate text-[11px] text-[var(--color-muted-foreground)]">
                    {a.camera_id ?? "—"}
                    {a.person_id != null ? ` · #${a.person_id}` : ""}
                    {a.peak_risk_pct != null ? ` · эрсдэл ${Math.round(a.peak_risk_pct)}%` : ""}
                    {" · "}
                    {relativeTime(a.created_at)}
                  </p>
                </div>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    color: levelColor(a.alert_level),
                    background: "color-mix(in srgb, " + levelColor(a.alert_level) + " 16%, transparent)",
                  }}
                >
                  {LEVEL_LABEL[a.alert_level]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function levelColor(level: AlertPublic["alert_level"]): string {
  switch (level) {
    case "review":
      return "var(--color-level-review)";
    case "notify":
      return "var(--color-level-notify)";
    case "log":
      return "var(--color-level-log)";
    default:
      return "var(--color-muted-foreground)";
  }
}

function NodeStrip({ nodes }: { nodes: OrgNodePublic[] }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
        Node эрүүл мэнд
      </h2>
      {nodes.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-4 text-sm text-[var(--color-muted-foreground)]">
          Энэ байгууллагын камер үйлчилж буй AI node алга.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {nodes.map((n) => (
            <NodeChip key={n.id} node={n} />
          ))}
        </ul>
      )}
    </section>
  );
}

function NodeChip({ node }: { node: OrgNodePublic }) {
  const online = node.is_online;
  const gpu = node.gpu_pct;
  const vramPct =
    node.vram_used_mb != null && node.vram_total_mb
      ? Math.min(100, Math.round((node.vram_used_mb / node.vram_total_mb) * 100))
      : null;
  const applied = node.provider_effective === node.provider;
  const providerOk = node.provider_ready !== false;
  return (
    <li
      className="rounded-[var(--radius)] border bg-[var(--color-surface)] px-3 py-2.5"
      style={{ borderColor: online ? "var(--color-border)" : "var(--color-danger)" }}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: online ? "var(--color-success)" : "var(--color-muted-foreground)" }}
          aria-hidden
        />
        <span className="truncate text-[13px] text-[var(--color-foreground)]">
          {node.name ?? "AI node"}
        </span>
        <span
          className="ml-auto text-[11px]"
          style={{ color: online ? "var(--color-muted-foreground)" : "var(--color-danger)" }}
        >
          {online ? (gpu != null ? `GPU ${gpu}%` : "онлайн") : "офлайн"}
        </span>
      </div>
      {online && vramPct != null && (
        <div className="mb-1.5 h-1 overflow-hidden rounded-full bg-[var(--color-muted)]">
          <div
            className="h-full"
            style={{
              width: `${vramPct}%`,
              background: vramPct > 92 ? "var(--color-warning)" : "var(--color-primary)",
            }}
          />
        </div>
      )}
      <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-muted-foreground)]">
        {node.vram_used_mb != null && node.vram_total_mb && (
          <span>
            VRAM {(node.vram_used_mb / 1024).toFixed(1)}/{(node.vram_total_mb / 1024).toFixed(0)}GB
          </span>
        )}
        {node.provider_effective && (
          <span className="inline-flex items-center gap-1">
            · {node.provider_effective}
            <span style={{ color: providerOk ? (applied ? "var(--color-success)" : "var(--color-warning)") : "var(--color-danger)" }}>
              {providerOk ? (applied ? "✓" : "⏳") : "⚠"}
            </span>
          </span>
        )}
        {!online && node.cameras.length > 0 && (
          <span style={{ color: "var(--color-danger)" }}>· {node.cameras.length} камер харанхуй</span>
        )}
      </div>
    </li>
  );
}

