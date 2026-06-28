"use client";

import { Badge } from "@chipmo-sentry/ui-kit";
import { X } from "lucide-react";

import { type Track, useLiveMetadata } from "@/lib/live-ws";

/** Behavior state-machine display labels (engine enum names — not part of the
 * /behaviors catalog, so a local map is the source of truth here). */
export const STATE_LABEL: Record<string, string> = {
  IDLE: "Идэвхгүй",
  SUSPICIOUS: "Сэжигтэй",
  PRODUCT_INTERACTION: "Бараатай харьцаж байна",
  CONCEALMENT: "Нуун далдлалт",
  EXIT_ATTEMPT: "Гарах оролдлого",
  ALERT: "Сэрэмжлүүлэг",
};

const LEVEL_TONE: Record<string, "neutral" | "warning" | "danger" | "notify"> = {
  LOW: "neutral",
  MEDIUM: "warning",
  HIGH: "notify",
  CRITICAL: "danger",
};

export type LiveBehaviorPanelProps = {
  /** MediaMTX path — the WS metadata channel id. */
  cameraId: string;
  name: string;
  /** Criterion/sequence key → Mongolian label (from GET /api/v1/behaviors). */
  labels: Record<string, string>;
  /** Risk level → Mongolian label (BehaviorConfig.level_labels). */
  levelLabels: Record<string, string>;
  onClose: () => void;
};

function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}мин ${s}с` : `${s}с`;
}

/** Per-person criteria breakdown card. Exported so the single-camera pipeline
 * lane can render the same breakdown inline (not just the slide-in panel). */
export function PersonCard({
  track,
  frameTsMs,
  labels,
  levelLabels,
}: {
  track: Track;
  frameTsMs: number;
  labels: Record<string, string>;
  levelLabels: Record<string, string>;
}) {
  const pid = track.store_person_id ?? track.person_id;
  const risk = track.store_risk_pct ?? track.risk_pct;
  const level = track.level ?? "LOW";
  const state = track.state ?? "IDLE";
  const behaviors = track.behaviors ?? [];
  const scores = track.behavior_scores ?? {};
  const sequences = track.sequences ?? [];
  const episodeSec =
    track.episode_started_ms != null
      ? (frameTsMs - track.episode_started_ms) / 1000
      : null;

  const dotClass =
    track.color === "red"
      ? "bg-red-500"
      : track.color === "yellow"
        ? "bg-yellow-400"
        : "bg-green-500";

  return (
    <div className="rounded-(--radius) border border-(--color-border) bg-(--color-background) p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} aria-hidden />
          <span className="text-sm font-semibold">Хүн #{pid}</span>
          <Badge tone={LEVEL_TONE[level] ?? "neutral"}>
            {levelLabels[level] ?? level}
          </Badge>
        </div>
        <span className="text-sm font-semibold tabular-nums">
          {risk > 0 ? `${risk.toFixed(0)}%` : "0%"}
        </span>
      </div>

      <div className="mt-1 flex items-center justify-between text-xs text-(--color-muted-foreground)">
        <span>{STATE_LABEL[state] ?? state}</span>
        {episodeSec != null && <span>Эпизод: {fmtDuration(episodeSec)}</span>}
      </div>

      {behaviors.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {behaviors.map((key) => (
            <li
              key={key}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span>{labels[key] ?? key}</span>
              <span className="font-mono tabular-nums text-(--color-muted-foreground)">
                {scores[key] != null ? `+${scores[key].toFixed(1)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-(--color-muted-foreground)">
          Шалгуур илрээгүй
        </p>
      )}

      {sequences.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {sequences.map((key) => (
            <Badge key={key} tone="danger">
              ⛓ {labels[key] ?? key}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * REV.2 — live behavior-criteria side panel. Opens from a tile's ListChecks
 * button; subscribes to the camera's own WS metadata channel (the backend
 * LiveBroker fans out to every subscriber, so this coexists with the tile's
 * overlay connection) and renders the per-person criteria breakdown live.
 */
export function LiveBehaviorPanel({
  cameraId,
  name,
  labels,
  levelLabels,
  onClose,
}: LiveBehaviorPanelProps) {
  const { latest, state: wsState } = useLiveMetadata(cameraId);

  const tracks = [...(latest?.tracks ?? [])].sort(
    (a, b) => (b.store_risk_pct ?? b.risk_pct) - (a.store_risk_pct ?? a.risk_pct),
  );

  return (
    <>
      {/* Backdrop — mobile only; on desktop the panel floats over the grid edge. */}
      <button
        type="button"
        aria-label="Хаах"
        onClick={onClose}
        className="fixed inset-0 z-30 bg-black/30 sm:hidden"
      />
      <aside
        role="dialog"
        aria-label={`${name} — сэжиг шалгуурууд`}
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xs flex-col border-l border-(--color-border) bg-(--color-background) shadow-xl"
      >
        <header className="flex items-center justify-between gap-2 border-b border-(--color-border) px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{name}</h2>
            <p className="truncate text-xs text-(--color-muted-foreground)">
              Сэжиг шалгуурууд · {wsState === "connected" ? "🟢 шууд" : wsState}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-(--color-muted-foreground) transition-colors hover:bg-(--color-muted)"
            aria-label="Хаах"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {tracks.length > 0 ? (
            tracks.map((t) => (
              <PersonCard
                key={t.person_id}
                track={t}
                frameTsMs={latest?.ts_ms ?? Date.now()}
                labels={labels}
                levelLabels={levelLabels}
              />
            ))
          ) : (
            <p className="p-4 text-center text-sm text-(--color-muted-foreground)">
              {wsState === "connected"
                ? "Одоогоор хүн илрээгүй"
                : "AI метадата хүлээж байна…"}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
