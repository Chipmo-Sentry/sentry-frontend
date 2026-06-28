"use client";

import { EmptyState, ErrorState, Spinner } from "@chipmo-sentry/ui-kit";
import { ArrowLeft, Bell, Brain, Cctv, CloudUpload, Route, ScanEye } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { PersonCard } from "@/components/LiveBehaviorPanel";
import {
  behaviors as behaviorsApi,
  nodes as nodesApi,
  type NodeDiagResponse,
  type OrgNodePublic,
} from "@/lib/api";
import { CATEGORY_LABEL, LEVEL_LABEL } from "@/lib/labels";
import { useLiveMetadata } from "@/lib/live-ws";
import {
  computeCameraRows,
  STAGE_LABEL,
  STAGE_ORDER,
  STAGE_PROCESS,
  STATUS_COLOR,
  worstStatus,
  type StageCell,
  type StageKey,
} from "@/lib/pipeline";
import { relativeTime } from "@/lib/time";
import type { AlertPublic } from "@/lib/types";

import { CameraSignal } from "./CameraSignal";
import { HealthDot, StatusPill } from "./ui";
import { usePipelineData } from "./usePipelineData";

const STAGE_ICON: Record<StageKey, typeof Cctv> = {
  camera: Cctv,
  ingest: CloudUpload,
  yolo: ScanEye,
  tracker: Route,
  vlm: Brain,
  decision: Bell,
};

export function StageDetail({
  stageKey,
  cameraFilter,
}: {
  stageKey: StageKey;
  cameraFilter: string | null;
}) {
  const valid = STAGE_ORDER.includes(stageKey);
  const { cams, error, reload, nodeList, ingest, push, signals, onReport, alerts, now } =
    usePipelineData();

  const rows = useMemo(
    () => computeCameraRows(cams ?? [], signals, nodeList, ingest, alerts, now, push),
    [cams, signals, nodeList, ingest, alerts, now, push],
  );
  const stageRows = useMemo(() => {
    const r = rows.map((row) => ({ cam: row.cam, node: row.node, cell: row.cells[stageKey] }));
    return cameraFilter ? r.filter((x) => x.cam.path === cameraFilter) : r;
  }, [rows, stageKey, cameraFilter]);

  if (!valid) {
    return (
      <div className="p-8">
        <EmptyState icon={Cctv} title="Ийм шат олдсонгүй" description={`"${stageKey}" гэсэн шат байхгүй.`} />
      </div>
    );
  }
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

  const Icon = STAGE_ICON[stageKey];
  const overall = worstStatus(stageRows.map((s) => s.cell.status));
  const down = stageRows.filter((s) => s.cell.status === "down");
  const warn = stageRows.filter((s) => s.cell.status === "warn");
  // Distinct problem reasons across the affected cameras (deduped).
  const problems = Array.from(
    new Set([...down, ...warn].map((s) => s.cell.reason).filter(Boolean) as string[]),
  );

  // Nodes relevant to the filtered cameras (or all when unfiltered).
  const relevantNodes =
    cameraFilter && stageRows[0]?.node ? [stageRows[0].node] : dedupeNodes(stageRows.map((s) => s.node));

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="hidden">
        {(cameraFilter ? cams.filter((c) => c.path === cameraFilter) : cams).map((c) => (
          <CameraSignal key={c.path} path={c.path} onReport={onReport} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/pipeline"
          className="inline-flex items-center gap-1 text-sm text-(--color-muted-foreground) hover:text-(--color-foreground)"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Урсгал
        </Link>
        <span className="text-(--color-muted-foreground)">/</span>
        <span className="inline-flex items-center gap-2">
          <Icon className="h-5 w-5" style={{ color: STATUS_COLOR[overall] }} aria-hidden />
          <h1 className="text-lg font-medium">{STAGE_LABEL[stageKey]}</h1>
        </span>
        <StatusPill status={overall} />
        {cameraFilter && (
          <span className="rounded-(--radius) bg-(--color-muted) px-2 py-0.5 text-xs text-(--color-muted-foreground)">
            {cameraFilter}
          </span>
        )}
        <span className="ml-auto text-xs text-(--color-muted-foreground)">
          {STAGE_PROCESS[stageKey]}
        </span>
      </div>

      {/* Diagnosis summary */}
      <div
        className="rounded-(--radius) border px-3 py-2.5 text-sm"
        style={{
          borderColor: STATUS_COLOR[overall],
          background:
            overall === "ok"
              ? "transparent"
              : "color-mix(in srgb, " + STATUS_COLOR[overall] + " 10%, transparent)",
        }}
      >
        {overall === "ok" ? (
          <span className="text-(--color-success)">Энэ шат бүх камер дээр хэвийн ажиллаж байна.</span>
        ) : (
          <div className="space-y-1">
            <p className="font-medium" style={{ color: STATUS_COLOR[overall] }}>
              {down.length} камер тасарсан · {warn.length} анхаарал
            </p>
            {problems.length > 0 && (
              <ul className="list-disc pl-5 text-(--color-muted-foreground)">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Per-camera table for this stage */}
      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-(--color-muted-foreground)">
          Камер бүрээр
        </h2>
        <div className="overflow-x-auto rounded-(--radius) border border-(--color-border)">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-(--color-border) text-left text-xs text-(--color-muted-foreground)">
                <th className="px-3 py-2 font-medium">Камер</th>
                <th className="px-3 py-2 font-medium">Node</th>
                <th className="px-3 py-2 font-medium">Төлөв</th>
                <th className="px-3 py-2 font-medium">Үр дүн</th>
                <th className="px-3 py-2 font-medium">Оношлогоо</th>
              </tr>
            </thead>
            <tbody>
              {stageRows.map((s) => (
                <Row key={s.cam.path} name={s.cam.name} path={s.cam.path} node={s.node} cell={s.cell} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Stage-specific deep detail */}
      {stageKey === "tracker" && (
        <TrackerLive cams={stageRows.map((s) => ({ path: s.cam.path, name: s.cam.name }))} />
      )}
      {(stageKey === "vlm" || stageKey === "yolo" || stageKey === "camera") && (
        <StageDiag nodes={relevantNodes} stageKey={stageKey} />
      )}
      {stageKey === "yolo" && <YoloNodes nodes={relevantNodes} />}
      {stageKey === "vlm" && <VlmNodes nodes={relevantNodes} alerts={alerts} />}
      {stageKey === "ingest" && <IngestPanel ingest={ingest} />}
      {stageKey === "decision" && <RecentVerdicts alerts={alerts} cameraIds={stageRows.map((s) => s.cam.path)} />}
    </div>
  );
}

function Row({
  name,
  path,
  node,
  cell,
}: {
  name: string;
  path: string;
  node: OrgNodePublic | null;
  cell: StageCell;
}) {
  return (
    <tr className="border-b border-(--color-border) last:border-0">
      <td className="px-3 py-2.5 align-top">
        <Link
          href={`/pipeline/camera/${encodeURIComponent(path)}`}
          className="text-(--color-foreground) hover:underline"
        >
          {name}
        </Link>
      </td>
      <td className="px-3 py-2.5 align-top text-(--color-muted-foreground)">{node?.name ?? "—"}</td>
      <td className="px-3 py-2.5 align-top">
        <StatusPill status={cell.status} />
      </td>
      <td className="px-3 py-2.5 align-top text-(--color-foreground)">{cell.short}</td>
      <td className="px-3 py-2.5 align-top text-(--color-muted-foreground)">{cell.reason ?? "—"}</td>
    </tr>
  );
}

function dedupeNodes(nodes: (OrgNodePublic | null)[]): OrgNodePublic[] {
  const seen = new Map<string, OrgNodePublic>();
  for (const n of nodes) if (n && !seen.has(n.id)) seen.set(n.id, n);
  return [...seen.values()];
}

function NodeCard({ node, children }: { node: OrgNodePublic; children: React.ReactNode }) {
  return (
    <div
      className="rounded-(--radius) border bg-(--color-surface) p-3"
      style={{ borderColor: node.is_online ? "var(--color-border)" : "var(--color-danger)" }}
    >
      <div className="mb-2 flex items-center gap-2">
        <HealthDot status={node.is_online ? "ok" : "down"} />
        <span className="font-medium text-(--color-foreground)">{node.name ?? "AI node"}</span>
        <span className="ml-auto text-xs text-(--color-muted-foreground)">
          {node.is_online ? "онлайн" : "офлайн"}
          {node.last_seen_at ? ` · ${relativeTime(node.last_seen_at)}` : ""}
        </span>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-(--radius) bg-(--color-muted) px-2.5 py-1.5">
      <div className="text-[10px] text-(--color-muted-foreground)">{label}</div>
      <div className="text-sm text-(--color-foreground)">{value}</div>
    </div>
  );
}

function YoloNodes({ nodes }: { nodes: OrgNodePublic[] }) {
  if (nodes.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-(--color-muted-foreground)">
        Node нөөц & per-камер YOLO
      </h2>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {nodes.map((n) => (
          <NodeCard key={n.id} node={n}>
            <div className="mb-2 grid grid-cols-3 gap-2">
              <Stat label="FPS" value={n.fps_inference != null ? n.fps_inference.toFixed(1) : "—"} />
              <Stat label="Идэвхтэй" value={n.active_cameras != null ? String(n.active_cameras) : "—"} />
              <Stat label="GPU" value={n.gpu_pct != null ? `${n.gpu_pct}%` : "—"} />
            </div>
            <ul className="space-y-1 text-xs">
              {n.cameras.map((c) => (
                <li key={c.camera_id} className="flex items-center gap-2">
                  <HealthDot status={c.status === "ok" ? "ok" : c.status === "stalled" ? "warn" : "down"} />
                  <span className="text-(--color-foreground)">{c.camera_id}</span>
                  <span className="ml-auto text-(--color-muted-foreground)">
                    {c.fps != null ? `${c.fps.toFixed(1)} fps` : "—"} ·{" "}
                    {c.status === "ok" ? "инференц" : c.status === "stalled" ? "кадргүй" : "алдаа"}
                  </span>
                </li>
              ))}
            </ul>
          </NodeCard>
        ))}
      </div>
    </section>
  );
}

function VlmNodes({ nodes, alerts }: { nodes: OrgNodePublic[]; alerts: AlertPublic[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-medium uppercase tracking-wide text-(--color-muted-foreground)">
        VLM провайдер & GPU
      </h2>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {nodes.map((n) => {
          const applied = n.provider_effective === n.provider;
          const providerOk = n.provider_ready !== false;
          const vramPct =
            n.vram_used_mb != null && n.vram_total_mb
              ? Math.round((n.vram_used_mb / n.vram_total_mb) * 100)
              : null;
          return (
            <NodeCard key={n.id} node={n}>
              <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-(--color-muted-foreground)">Провайдер:</span>
                <span className="text-(--color-foreground)">{n.provider}</span>
                {n.provider_effective && n.provider_effective !== n.provider && (
                  <span className="text-(--color-muted-foreground)">→ {n.provider_effective}</span>
                )}
                <span
                  style={{
                    color: providerOk
                      ? applied
                        ? "var(--color-success)"
                        : "var(--color-warning)"
                      : "var(--color-danger)",
                  }}
                >
                  {providerOk ? (applied ? "✓ хэрэгжсэн" : "⏳ хэрэгжиж буй") : "⚠ бэлэн бус"}
                </span>
              </div>
              {n.provider_error && (
                <p className="mb-2 text-xs text-(--color-danger)">{n.provider_error}</p>
              )}
              <div className="mb-2 grid grid-cols-3 gap-2">
                <Stat label="Сүүлд" value={n.vlm_activity?.last_ago_sec != null ? `${n.vlm_activity.last_ago_sec}с` : "—"} />
                <Stat
                  label="Хугацаа"
                  value={n.vlm_activity?.last_latency_ms != null ? `${(n.vlm_activity.last_latency_ms / 1000).toFixed(1)}с` : "—"}
                />
                <Stat label="Тоо" value={n.vlm_activity?.count != null ? String(n.vlm_activity.count) : "—"} />
              </div>
              <div className="text-xs text-(--color-muted-foreground)">
                {n.vlm?.loaded
                  ? `GPU дээр: ${n.vlm.model ?? "—"} · ${n.vlm.vram_mb != null ? (n.vlm.vram_mb / 1024).toFixed(1) + "GB" : "—"} · ${n.vlm.gpu_pct ?? "—"}%`
                  : "VLM GPU дээр ачаалагдаагүй (event-driven)"}
                {vramPct != null && ` · VRAM ${vramPct}%`}
              </div>
            </NodeCard>
          );
        })}
      </div>
      <RecentVerdicts alerts={alerts} />
    </section>
  );
}

function IngestPanel({ ingest }: { ingest: { available: boolean; paths: { path: string; name: string; ready: boolean; readers: number }[] } | null }) {
  if (!ingest || !ingest.available) {
    return (
      <p className="rounded-(--radius) border border-(--color-border) bg-(--color-surface) px-3 py-3 text-sm text-(--color-muted-foreground)">
        MediaMTX-ийн удирдлагын API-тай холбогдоогүй тул замын төлөв тайлагнаагүй. (Backend-ийн
        <code className="mx-1">MEDIAMTX_API_URL</code> ingest-ийн :9997 руу хүрэх эсэхийг шалгана уу.)
      </p>
    );
  }
  const notReady = ingest.paths.filter((p) => !p.ready);
  return (
    <p className="rounded-(--radius) border border-(--color-border) bg-(--color-surface) px-3 py-3 text-sm text-(--color-muted-foreground)">
      Үүлэн MediaMTX дээр {ingest.paths.filter((p) => p.ready).length}/{ingest.paths.length} зам идэвхтэй.
      {notReady.length > 0 && ` Publisher хүлээж буй: ${notReady.map((p) => p.name).join(", ")}.`}
    </p>
  );
}

function TrackerLive({ cams }: { cams: { path: string; name: string }[] }) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [levelLabels, setLevelLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    behaviorsApi.get().then(
      (cfg) => {
        if (cancelled) return;
        const m: Record<string, string> = {};
        for (const d of cfg.dimensions) m[d.key] = d.label_mn;
        setLabels(m);
        setLevelLabels(cfg.level_labels ?? {});
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-(--color-muted-foreground)">
        Амьд хүн + state machine
      </h2>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {cams.map((c) => (
          <TrackerCam
            key={c.path}
            path={c.path}
            name={c.name}
            labels={labels}
            levelLabels={levelLabels}
          />
        ))}
      </div>
    </section>
  );
}

function TrackerCam({
  path,
  name,
  labels,
  levelLabels,
}: {
  path: string;
  name: string;
  labels: Record<string, string>;
  levelLabels: Record<string, string>;
}) {
  const { latest, state } = useLiveMetadata(path);
  const tracks = [...(latest?.tracks ?? [])].sort(
    (a, b) => (b.store_risk_pct ?? b.risk_pct) - (a.store_risk_pct ?? a.risk_pct),
  );
  return (
    <div className="rounded-(--radius) border border-(--color-border) bg-(--color-surface) p-3">
      <div className="mb-2 flex items-center gap-2">
        <HealthDot status={state === "connected" ? "ok" : "unknown"} />
        <span className="text-sm font-medium text-(--color-foreground)">{name}</span>
        <span className="ml-auto text-xs text-(--color-muted-foreground)">
          {tracks.length} хүн
        </span>
      </div>
      {tracks.length > 0 ? (
        <div className="space-y-2">
          {tracks.map((t) => (
            <PersonCard
              key={t.person_id}
              track={t}
              frameTsMs={latest?.ts_ms ?? Date.now()}
              labels={labels}
              levelLabels={levelLabels}
            />
          ))}
        </div>
      ) : (
        <p className="py-3 text-center text-xs text-(--color-muted-foreground)">
          {state === "connected" ? "AI холбогдсон · 0 хүн" : "AI метадата хүлээж байна…"}
        </p>
      )}
    </div>
  );
}

function StageDiag({ nodes, stageKey }: { nodes: OrgNodePublic[]; stageKey: StageKey }) {
  const [diags, setDiags] = useState<Record<string, NodeDiagResponse>>({});
  const ids = nodes.map((n) => n.id).join(",");
  useEffect(() => {
    if (!nodes.length) return;
    let cancelled = false;
    const fetchAll = () => {
      for (const n of nodes) {
        nodesApi.diag(n.id).then(
          (r) => {
            if (!cancelled) setDiags((p) => ({ ...p, [n.id]: r }));
          },
          () => {},
        );
      }
    };
    fetchAll();
    const t = setInterval(fetchAll, 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  if (!nodes.length) return null;
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-(--color-muted-foreground)">
        Node оношлогоо — дэлгэрэнгүй лог
      </h2>
      <div className="space-y-3">
        {nodes.map((n) => {
          const res = diags[n.id];
          const label = n.name ?? "AI node";
          if (!res) {
            return (
              <p
                key={n.id}
                className="rounded-(--radius) border border-(--color-border) bg-(--color-surface) px-3 py-3 text-sm text-(--color-muted-foreground)"
              >
                {label}: уншиж байна…
              </p>
            );
          }
          if (!res.available || !res.diag) {
            return (
              <p
                key={n.id}
                className="rounded-(--radius) border border-(--color-border) bg-(--color-surface) px-3 py-3 text-sm text-(--color-muted-foreground)"
              >
                {label}: diag тайлагнаагүй (хуучин build эсвэл push хүлээж байна — node-д шинэ
                хувилбар deploy хийх шаардлагатай).
              </p>
            );
          }
          return (
            <NodeDiagCard
              key={n.id}
              name={label}
              ageSec={res.age_sec}
              diag={res.diag}
              stageKey={stageKey}
            />
          );
        })}
      </div>
    </section>
  );
}

function NodeDiagCard({
  name,
  ageSec,
  diag,
  stageKey,
}: {
  name: string;
  ageSec: number | null;
  diag: NonNullable<NodeDiagResponse["diag"]>;
  stageKey: StageKey;
}) {
  const v = diag.vlm;
  return (
    <div className="rounded-(--radius) border border-(--color-border) bg-(--color-surface) p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-(--color-muted-foreground)">
        <span className="font-medium text-(--color-foreground)">{name}</span>
        <span>· v{diag.version}</span>
        <span className="ml-auto">{ageSec != null ? `${ageSec}с өмнө` : ""}</span>
      </div>

      {stageKey === "vlm" ? (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-(--color-muted-foreground)">
            <Chip>num_predict {v.config.num_predict}</Chip>
            <Chip>num_ctx {v.config.num_ctx}</Chip>
            <Chip>frames {v.config.frames_per_clip}</Chip>
            <Chip>max_dim {v.config.frame_max_dim}</Chip>
            <Chip>retry {v.config.retry_on_parse_error}</Chip>
            {v.parse_fail_pct != null && (
              <span
                className="rounded px-1.5 py-0.5 font-medium"
                style={{
                  color: v.parse_fail_pct > 30 ? "var(--color-danger)" : "var(--color-success)",
                  background:
                    "color-mix(in srgb, " +
                    (v.parse_fail_pct > 30 ? "var(--color-danger)" : "var(--color-success)") +
                    " 14%, transparent)",
                }}
              >
                parse-fail {v.parse_fail_pct}%
              </span>
            )}
          </div>
          {v.provider_error && (
            <p className="mb-2 text-xs text-(--color-danger)">{v.provider_error}</p>
          )}
          {v.verdicts.length === 0 ? (
            <p className="text-xs text-(--color-muted-foreground)">
              VLM verdict алга (breach хүлээж байна).
            </p>
          ) : (
            <ul className="space-y-1.5">
              {[...v.verdicts].reverse().map((vd, i) => (
                <li
                  key={i}
                  className="rounded-(--radius) border-l-2 px-2.5 py-1.5 text-xs"
                  style={{
                    borderLeftColor: vd.parsed ? "var(--color-success)" : "var(--color-danger)",
                    background: "var(--color-muted)",
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums text-(--color-muted-foreground)">
                      {new Date(vd.ts * 1000).toLocaleTimeString("mn-MN")}
                    </span>
                    <span className="text-(--color-foreground)">{vd.category}</span>
                    <span className="text-(--color-muted-foreground)">
                      conf {vd.confidence}
                    </span>
                    <span className="text-(--color-muted-foreground)">
                      {(vd.latency_ms / 1000).toFixed(1)}с · {vd.frames_used} frame
                    </span>
                    <span
                      className="ml-auto"
                      style={{
                        color: vd.parsed ? "var(--color-success)" : "var(--color-danger)",
                      }}
                    >
                      {vd.parsed ? "✓ parse OK" : "✗ parse-fail"}
                    </span>
                  </div>
                  {!vd.parsed && vd.raw && (
                    <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-(--color-background) p-2 font-mono text-[10px] text-(--color-muted-foreground)">
                      {vd.raw}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-(--color-border) text-left text-(--color-muted-foreground)">
                <th className="px-2 py-1 font-medium">Камер</th>
                <th className="px-2 py-1 font-medium">fps (cap/inf)</th>
                <th className="px-2 py-1 font-medium">Frame</th>
                <th className="px-2 py-1 font-medium">Det</th>
                <th className="px-2 py-1 font-medium">Алдаа</th>
              </tr>
            </thead>
            <tbody>
              {diag.workers.map((w) => (
                <tr key={w.camera_id} className="border-b border-(--color-border) last:border-0">
                  <td className="px-2 py-1 text-(--color-foreground)">{w.camera_id}</td>
                  <td className="px-2 py-1 tabular-nums">
                    {w.fps_capture}/{w.fps_inference}
                  </td>
                  <td className="px-2 py-1 tabular-nums">{w.frames_total}</td>
                  <td className="px-2 py-1 tabular-nums">{w.detections_total}</td>
                  <td
                    className="px-2 py-1"
                    style={{ color: w.last_error ? "var(--color-danger)" : "var(--color-success)" }}
                  >
                    {w.last_error ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-(--color-muted) px-1.5 py-0.5 text-(--color-muted-foreground)">
      {children}
    </span>
  );
}

function RecentVerdicts({ alerts, cameraIds }: { alerts: AlertPublic[]; cameraIds?: string[] }) {
  let list = alerts;
  if (cameraIds && cameraIds.length) list = alerts.filter((a) => a.camera_id && cameraIds.includes(a.camera_id));
  const recent = list.slice(0, 8);
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-(--color-muted-foreground)">
        Сүүлийн дүгнэлтүүд
      </h2>
      {recent.length === 0 ? (
        <p className="rounded-(--radius) border border-(--color-border) bg-(--color-surface) px-3 py-3 text-sm text-(--color-muted-foreground)">
          Энэ session-д дүгнэлт алга.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {recent.map((a) => (
            <li key={a.id}>
              <Link
                href={`/alerts/${a.id}`}
                className="flex items-center gap-2.5 rounded-(--radius) border border-(--color-border) bg-(--color-surface) px-3 py-2 transition-colors hover:bg-(--color-muted)"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-(--color-foreground)">
                  {CATEGORY_LABEL[a.category]} · {Math.round(a.confidence * 100)}%
                  <span className="text-(--color-muted-foreground)"> · {relativeTime(a.created_at)}</span>
                </span>
                <span className="shrink-0 text-xs text-(--color-muted-foreground)">
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
