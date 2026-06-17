"use client";

import { useEffect, useRef } from "react";

import { useLiveMetadata } from "@/lib/live-ws";

/** Live signal one camera contributes to the Pipeline Canvas aggregate. */
export type CameraSig = {
  connected: boolean;
  /** Per-frame YOLO throughput reported by the node (GPU-contended). */
  fps: number;
  /** People currently tracked in the latest frame. */
  trackCount: number;
  counts: { green: number; yellow: number; red: number };
  maxRisk: number;
  maxColor: "green" | "yellow" | "red" | null;
  /** Epoch ms of the last real frame — null until the first arrives. */
  lastFrameAt: number | null;
};

const EMPTY: CameraSig = {
  connected: false,
  fps: 0,
  trackCount: 0,
  counts: { green: 0, yellow: 0, red: 0 },
  maxRisk: 0,
  maxColor: null,
  lastFrameAt: null,
};

/**
 * Headless probe: subscribes to ONE camera's /ws/live channel and reports its
 * derived signal upward. Rendering N of these (one per enabled camera) lets the
 * canvas aggregate live tracking across the whole store without calling the
 * useLiveMetadata hook in a loop. Renders nothing.
 */
export function CameraSignal({
  path,
  onReport,
}: {
  path: string;
  onReport: (path: string, sig: CameraSig) => void;
}) {
  const { latest, state, lastFrameAt } = useLiveMetadata(path);
  // Keep the latest callback without making it an effect dependency (it changes
  // identity every parent render — we only want to re-report on signal change).
  const reportRef = useRef(onReport);
  reportRef.current = onReport;

  useEffect(() => {
    const tracks = latest?.tracks ?? [];
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
    reportRef.current(path, {
      ...EMPTY,
      connected: state === "connected",
      fps: latest?.fps_inference ?? 0,
      trackCount: tracks.length,
      counts,
      maxRisk,
      maxColor,
      lastFrameAt,
    });
  }, [path, latest, state, lastFrameAt]);

  // Report a disconnected/empty signal on unmount so a removed camera doesn't
  // leave a stale "live" contribution in the aggregate.
  useEffect(() => {
    const p = path;
    return () => reportRef.current(p, EMPTY);
  }, [path]);

  return null;
}
