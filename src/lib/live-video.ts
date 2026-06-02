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
export function attachLiveVideo(
  video: HTMLVideoElement,
  src: LiveVideoSource,
  cbs: AttachCallbacks = {},
): () => void {
  let disposed = false;
  let cleanup: (() => void) | null = null;
  let fellBack = false;

  function startHls() {
    if (disposed) return;
    fellBack = true;
    cbs.onTransport?.("hls");
    try {
      const detach = attachHls(video, src.hlsUrl);
      cleanup = detach;
    } catch (e) {
      cbs.onError?.(e instanceof Error ? e : new Error("HLS дэмжлэггүй"));
    }
  }

  // WebRTC first.
  cbs.onTransport?.("webrtc");
  const whep = attachWhep(video, src.whepUrl, {
    onConnected: () => {
      if (disposed || fellBack) return;
      cbs.onConnected?.();
    },
    onError: () => {
      if (disposed || fellBack) return;
      // WHEP failed → swap to HLS.
      whep.close();
      startHls();
    },
  });
  cleanup = () => whep.close();

  // Safety net: if WebRTC produces no frames within a few seconds, fall back.
  const fallbackTimer = setTimeout(() => {
    if (disposed || fellBack) return;
    if (video.readyState < 2) {
      whep.close();
      startHls();
    }
  }, 4000);

  return () => {
    disposed = true;
    clearTimeout(fallbackTimer);
    cleanup?.();
  };
}
