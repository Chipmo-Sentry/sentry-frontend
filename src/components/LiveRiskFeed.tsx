"use client";

import { riskColor } from "@chipmo-sentry/ui-kit";
import { Activity } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useLiveMetadata, type Track } from "@/lib/live-ws";

/**
 * Live suspicious-actions feed — the operator's view INTO the pipeline:
 * agent stream → YOLO → behavior engine scores every tracked person; anyone
 * over the risk floor appears here with the engine's own Mongolian reasons,
 * BEFORE the high-risk ones graduate to a vLLM-verified alert (those land in
 * the alert rail below). Purely presentational: reuses the per-camera
 * metadata WebSocket frames the tiles already receive.
 */

const MIN_RISK_PCT = 15; // below this a person is just shopping
const STALE_MS = 12_000; // a camera that stopped sending drops out
const MAX_ROWS = 10;

interface FeedRow {
  key: string;
  camera: string;
  pid: number;
  risk: number;
  storeRisk: number | null;
  reason: string;
  points: number;
  at: number;
}

/** Invisible per-camera subscriber — lifts suspicious tracks up to the feed. */
function RiskSource({
  cameraId,
  name,
  onRows,
}: {
  cameraId: string;
  name: string;
  onRows: (cameraId: string, rows: FeedRow[]) => void;
}) {
  const { latest } = useLiveMetadata(cameraId);
  useEffect(() => {
    if (!latest) return;
    const now = Date.now();
    const rows: FeedRow[] = [];
    for (const t of latest.tracks as Track[]) {
      const risk = t.risk_pct ?? 0;
      if (risk < MIN_RISK_PCT && !(t.behaviors && t.behaviors.length > 0)) continue;
      const points = t.behavior_scores
        ? Object.values(t.behavior_scores).reduce((a, b) => a + (Number(b) || 0), 0)
        : 0;
      rows.push({
        key: `${cameraId}#${t.store_person_id ?? t.person_id}`,
        camera: name,
        pid: t.store_person_id ?? t.person_id,
        risk,
        storeRisk: t.store_risk_pct ?? null,
        reason:
          (t.reasons && t.reasons[t.reasons.length - 1]) ||
          (t.state === "CONCEALMENT" ? "Далдлах хөдөлгөөн" : "Сэжигтэй байдал"),
        points: Math.round(points),
        at: now,
      });
    }
    onRows(cameraId, rows);
  }, [latest, cameraId, name, onRows]);
  return null;
}

export function LiveRiskFeed({
  cams,
}: {
  cams: { path: string; name: string }[];
}) {
  const [byCam, setByCam] = useState<Map<string, FeedRow[]>>(new Map());
  const onRows = useCallback((cameraId: string, rows: FeedRow[]) => {
    setByCam((prev) => {
      const next = new Map(prev);
      next.set(cameraId, rows);
      return next;
    });
  }, []);

  const now = Date.now();
  const flat = Array.from(byCam.values())
    .flat()
    .filter((r) => now - r.at < STALE_MS)
    .sort((a, b) => (b.storeRisk ?? b.risk) - (a.storeRisk ?? a.risk))
    .slice(0, MAX_ROWS);

  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-(--color-border) bg-(--color-background)">
      {cams.map((c) => (
        <RiskSource key={c.path} cameraId={c.path} name={c.name} onRows={onRows} />
      ))}
      <div className="flex items-center gap-2 border-b border-(--color-border) px-3 py-2">
        <Activity className="h-3.5 w-3.5 text-(--color-muted-foreground)" aria-hidden />
        <span className="text-xs font-medium">Эрсдэлтэй үйлдлүүд</span>
        <span className="ml-auto text-[10px] text-(--color-muted-foreground)">
          YOLO · зан төлөв
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {flat.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-(--color-muted-foreground)">
            Одоогоор сэжигтэй үйлдэл алга — хүн бүр зүгээр л дэлгүүр хэсэж байна.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {flat.map((r) => {
              const shown = r.storeRisk ?? r.risk;
              return (
                <li
                  key={r.key}
                  className="rounded-md border border-(--color-border) bg-(--color-surface) px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold text-black"
                      style={{ background: riskColor(shown) }}
                    >
                      {Math.round(shown)}%
                    </span>
                    <span className="truncate text-[11px] font-medium">{r.reason}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-(--color-muted-foreground)">
                    <span className="truncate">{r.camera}</span>
                    <span>#{r.pid}</span>
                    {r.points > 0 ? <span>{r.points} оноо</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
