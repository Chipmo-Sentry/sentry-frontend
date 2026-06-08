"use client";

import { useEffect, useRef, useState } from "react";

/**
 * One detection box from sentry-ai's per-frame metadata.
 * Coordinates are in the SOURCE FRAME pixel space (not the displayed video size) —
 * the canvas overlay must scale by displayWidth/sourceWidth.
 */
export type Track = {
  person_id: number;
  box: [number, number, number, number]; // [x1, y1, x2, y2]
  det_confidence: number;
  risk_pct: number;     // 0 in L2/L3; populated by L4 behavior scoring
  color: "green" | "yellow" | "red";
  // Cross-camera re-ID (ADR-0023): store-global person id shared across the
  // store's cameras + their accumulated risk. null when re-ID is disabled
  // (e.g. an older AI node) → the overlay falls back to the per-camera person_id.
  store_person_id?: number | null;
  store_risk_pct?: number | null;
};

export type FrameMetadata = {
  camera_id: string;
  frame_id: number;
  ts_ms: number;
  width: number;        // source frame width
  height: number;       // source frame height
  fps_inference: number;
  tracks: Track[];
};

export type LiveConnState = "connecting" | "connected" | "disconnected" | "error";

const BACKEND_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function wsBase(): string {
  // http://host → ws://host  · https://host → wss://host
  if (BACKEND_BASE) return BACKEND_BASE.replace(/^http/, "ws");
  // Same-origin (default): derive ws[s]://<this-host> from the page so the
  // host-only SameSite=Lax cookie is sent on the WS handshake. Requires the
  // `/ws` rewrite in next.config.mjs to forward the Upgrade to the backend.
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/^http/, "ws");
  }
  return "";
}

/**
 * Subscribe to backend WS `/ws/live/{camera_id}` and keep the latest frame
 * metadata in state. Auto-reconnects on disconnect (exp backoff 1s→30s).
 */
export function useLiveMetadata(cameraId: string) {
  const [latest, setLatest] = useState<FrameMetadata | null>(null);
  const [state, setState] = useState<LiveConnState>("connecting");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoffMs = 1000;

    function connect() {
      if (cancelled) return;
      setState("connecting");
      const url = `${wsBase()}/ws/live/${encodeURIComponent(cameraId)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        backoffMs = 1000;
        setState("connected");
      };
      ws.onmessage = (e) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(e.data);
          if (data && data._type === "heartbeat") return;
          if (data && typeof data.camera_id === "string") {
            setLatest(data as FrameMetadata);
          }
        } catch {
          // ignore malformed frames
        }
      };
      ws.onerror = () => {
        if (cancelled) return;
        setState("error");
      };
      ws.onclose = () => {
        if (cancelled) return;
        setState("disconnected");
        // Exponential backoff reconnect (capped at 30s)
        reconnectTimer = setTimeout(connect, backoffMs);
        backoffMs = Math.min(backoffMs * 2, 30000);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [cameraId]);

  return { latest, state };
}
