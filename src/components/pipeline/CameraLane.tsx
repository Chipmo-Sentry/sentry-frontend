"use client";

import { EmptyState, ErrorState, Spinner } from "@chipmo-sentry/ui-kit";
import { ArrowLeft, Bell, Brain, Cctv, CloudUpload, Route, ScanEye } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PersonCard, STATE_LABEL } from "@/components/LiveBehaviorPanel";
import { LiveCameraTile } from "@/components/LiveCameraTile";
import { behaviors as behaviorsApi } from "@/lib/api";
import { useLiveMetadata } from "@/lib/live-ws";
import {
  computeCameraRows,
  deriveCameraSig,
  STAGE_LABEL,
  STAGE_ORDER,
  STATUS_COLOR,
  worstStatus,
  type StageKey,
} from "@/lib/pipeline";

import { HealthDot, StatusPill } from "./ui";
import { usePipelineData } from "./usePipelineData";

const MEDIAMTX_HLS_BASE = process.env.NEXT_PUBLIC_MEDIAMTX_HLS_BASE ?? "http://localhost:8888";
const MEDIAMTX_WHEP_BASE = process.env.NEXT_PUBLIC_MEDIAMTX_WHEP_BASE ?? "http://localhost:8889";

const STAGE_ICON: Record<StageKey, typeof Cctv> = {
  camera: Cctv,
  ingest: CloudUpload,
  yolo: ScanEye,
  tracker: Route,
  vlm: Brain,
  decision: Bell,
};

const RISK_HEX = { green: "#22c55e", yellow: "#eab308", red: "#ef4444" } as const;

/** One camera's whole pipeline in a single column: video + overlay, the 6
 * stages as a vertical lane, the per-person behavior breakdown, and a per-track
 * table — so an operator confirms exactly which hop is broken while watching it. */
export function CameraLane({ path }: { path: string }) {
  const { cams, error, reload, nodeList, ingest, push, alerts, now } = usePipelineData();
  const { latest, state, lastFrameAt } = useLiveMetadata(path);
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

  const cam = useMemo(() => cams?.find((c) => c.path === path) ?? null, [cams, path]);

  const row = useMemo(() => {
    const sig = deriveCameraSig(
      latest?.tracks ?? [],
      state === "connected",
      latest?.fps_inference ?? 0,
      lastFrameAt,
    );
    const entry = cam ?? { id: path, path, name: path };
    return (
      computeCameraRows([entry], { [path]: sig }, nodeList, ingest, alerts, now, push)[0] ?? null
    );
  }, [cam, path, latest, state, lastFrameAt, nodeList, ingest, push, alerts, now]);

  const tracks = useMemo(
    () =>
      [...(latest?.tracks ?? [])].sort(
        (a, b) => (b.store_risk_pct ?? b.risk_pct) - (a.store_risk_pct ?? a.risk_pct),
      ),
    [latest],
  );

  if (error) {
    return (
      <div className="p-8">
        <ErrorState message={error} onRetry={reload} />
      </div>
    );
  }
  if (cams === null || !row) {
    return (
      <div className="p-8">
        <Spinner label="Уншиж байна…" />
      </div>
    );
  }

  const overall = worstStatus(STAGE_ORDER.map((s) => row.cells[s].status));
  const name = cam?.name ?? path;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/pipeline"
          className="inline-flex items-center gap-1 text-sm text-(--color-muted-foreground) hover:text-(--color-foreground)"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Урсгал
        </Link>
        <span className="text-(--color-muted-foreground)">/</span>
        <h1 className="text-lg font-medium">{name}</h1>
        <StatusPill status={overall} />
        {row.node && (
          <span className="text-xs text-(--color-muted-foreground)">{row.node.name}</span>
        )}
        <span className="ml-auto text-xs text-(--color-muted-foreground)">
          {state === "connected" ? "AI шууд" : `AI: ${state}`}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
        {/* LEFT — video + vertical stage lane */}
        <div className="space-y-3">
          <div className="aspect-video">
            <LiveCameraTile
              cameraId={path}
              streamCameraId={cam?.id}
              name={name}
              whepUrl={`${MEDIAMTX_WHEP_BASE}/${path}/whep`}
              hlsUrl={`${MEDIAMTX_HLS_BASE}/${path}/index.m3u8`}
            />
          </div>

          <section>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-(--color-muted-foreground)">
              Шатууд
            </h2>
            <div className="divide-y divide-(--color-border) rounded-(--radius) border border-(--color-border)">
              {STAGE_ORDER.map((s) => {
                const cell = row.cells[s];
                const Icon = STAGE_ICON[s];
                return (
                  <Link
                    key={s}
                    href={`/pipeline/stage/${s}?camera=${encodeURIComponent(path)}`}
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-(--color-muted)"
                  >
                    <Icon className="h-4 w-4 shrink-0" style={{ color: STATUS_COLOR[cell.status] }} aria-hidden />
                    <span className="w-28 shrink-0 text-sm text-(--color-foreground)">
                      {STAGE_LABEL[s]}
                    </span>
                    <StatusPill status={cell.status} />
                    <span className="ml-auto truncate text-right text-xs text-(--color-muted-foreground)">
                      {cell.reason ?? cell.short}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>

        {/* RIGHT — per-person behavior breakdown */}
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-(--color-muted-foreground)">
            Хүн бүрийн задаргаа
          </h2>
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
            <p className="rounded-(--radius) border border-(--color-border) bg-(--color-surface) px-3 py-6 text-center text-sm text-(--color-muted-foreground)">
              {state === "connected" ? "AI холбогдсон · 0 хүн" : "AI метадата хүлээж байна…"}
            </p>
          )}
        </section>
      </div>

      {/* Per-track table */}
      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-(--color-muted-foreground)">
          Мөшгиж буй хүмүүс
        </h2>
        <div className="overflow-x-auto rounded-(--radius) border border-(--color-border)">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-(--color-border) text-left text-xs text-(--color-muted-foreground)">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Эрсдэл</th>
                <th className="px-3 py-2 font-medium">Төлөв</th>
                <th className="px-3 py-2 font-medium">Идэвхтэй шалгуур</th>
              </tr>
            </thead>
            <tbody>
              {tracks.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-(--color-muted-foreground)">
                    —
                  </td>
                </tr>
              ) : (
                tracks.map((t) => {
                  const pid = t.store_person_id ?? t.person_id;
                  const risk = Math.round(t.risk_pct);
                  const beh = (t.behaviors ?? []).map((k) => labels[k] ?? k).slice(0, 3);
                  return (
                    <tr key={t.person_id} className="border-b border-(--color-border) last:border-0">
                      <td className="px-3 py-2.5 align-top text-(--color-foreground)">#{pid}</td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-(--color-muted)">
                            <div
                              className="h-full"
                              style={{ width: `${risk}%`, background: RISK_HEX[t.color] }}
                            />
                          </div>
                          <span className="tabular-nums text-xs">{risk}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-top text-xs text-(--color-foreground)">
                        {STATE_LABEL[t.state ?? "IDLE"] ?? t.state}
                      </td>
                      <td className="px-3 py-2.5 align-top text-xs text-(--color-muted-foreground)">
                        {beh.length ? beh.join(", ") : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
