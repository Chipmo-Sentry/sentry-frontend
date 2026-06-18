"use client";

import { useEffect, useRef } from "react";

import { useLiveMetadata } from "@/lib/live-ws";
import { deriveCameraSig, type CameraSig } from "@/lib/pipeline";

export type { CameraSig };

const EMPTY: CameraSig = deriveCameraSig([], false, 0, null);

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
    reportRef.current(
      path,
      deriveCameraSig(
        latest?.tracks ?? [],
        state === "connected",
        latest?.fps_inference ?? 0,
        lastFrameAt,
      ),
    );
  }, [path, latest, state, lastFrameAt]);

  // Report a disconnected/empty signal on unmount so a removed camera doesn't
  // leave a stale "live" contribution in the aggregate.
  useEffect(() => {
    const p = path;
    return () => reportRef.current(p, EMPTY);
  }, [path]);

  return null;
}
