/**
 * Unified live-video attachment: try WebRTC/WHEP first (sub-second latency),
 * fall back to HLS if the WebRTC handshake fails (e.g. UDP blocked, no
 * reachable ICE candidates). The AI metadata overlay is transport-agnostic —
 * it always comes from the backend WS — so either transport renders identically.
 */

import { attachHls } from "@/lib/hls";
import { attachWhep } from "@/lib/whep";

export type LiveTransport = "webrtc" | "hls";

export type AttachCallbacks = {
  onTransport?: (t: LiveTransport) => void;
  onConnected?: () => void;
  onError?: (err: Error) => void;
};

export type LiveVideoSource = {
  whepUrl: string;
  hlsUrl: string;
};

/**
 * Attach a live source to `video`. Returns a cleanup function. Attempts WHEP;
 * on failure (or timeout) tears it down and attaches HLS instead.
 */
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export function attachLiveVideo(
  video: HTMLVideoElement,
  src: LiveVideoSource,
  cbs: AttachCallbacks = {},
): () => void {
  let disposed = false;
  let cleanup: (() => void) | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let backoffMs = RECONNECT_MIN_MS;

  // Reconnect the WHOLE pipeline (WHEP-first again) after an ESTABLISHED stream
  // drops — without this a single blip leaves a permanent black tile, breaking
  // the 24h ≥99%/cam uptime target.
  function scheduleReconnect() {
    if (disposed || reconnectTimer) return;
    cleanup?.();
    cleanup = null;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      backoffMs = Math.min(backoffMs * 2, RECONNECT_MAX_MS);
      attempt();
    }, backoffMs);
  }

  function attempt() {
    if (disposed) return;
    let fellBack = false;
    let connectedOnce = false;

    function startHls() {
      if (disposed) return;
      fellBack = true;
      cbs.onTransport?.("hls");
      try {
        cleanup = attachHls(video, src.hlsUrl, { onFatal: () => scheduleReconnect() });
      } catch (e) {
        cbs.onError?.(e instanceof Error ? e : new Error("HLS дэмжлэггүй"));
        scheduleReconnect();
      }
    }

    // WebRTC first.
    cbs.onTransport?.("webrtc");
    const whep = attachWhep(video, src.whepUrl, {
      onConnected: () => {
        if (disposed || fellBack) return;
        connectedOnce = true;
        backoffMs = RECONNECT_MIN_MS; // reset after a healthy connection
        cbs.onConnected?.();
      },
      onError: () => {
        if (disposed || fellBack) return;
        whep.close();
        // Post-connect drop → full reconnect; initial failure → try HLS.
        if (connectedOnce) scheduleReconnect();
        else startHls();
      },
    });

    // Safety net: if WebRTC produces no frames within a few seconds, fall back.
    const fallbackTimer = setTimeout(() => {
      if (disposed || fellBack) return;
      if (video.readyState < 2) {
        whep.close();
        startHls();
      }
    }, 4000);

    cleanup = () => {
      clearTimeout(fallbackTimer);
      whep.close();
    };
  }

  attempt();

  return () => {
    disposed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    cleanup?.();
  };
}
