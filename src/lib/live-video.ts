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
  /** Called before each reconnect attempt to re-mint the stream URLs — the
   * `?jwt=` read token expires after ~1h, so a long-lived dashboard reconnecting
   * with its original URLs would 401 forever. Return null to keep current URLs. */
  refreshSource?: () => Promise<LiveVideoSource | null>;
};

export type LiveVideoSource = {
  whepUrl: string;
  hlsUrl: string;
  /** Skip the WebRTC attempt and go straight to HLS. Set for the cloud HTTPS HLS
   * proxy, where WebRTC (UDP/ICE) can't traverse and only adds a 4s dead wait. */
  hlsOnly?: boolean;
};

/**
 * Attach a live source to `video`. Returns a cleanup function. Attempts WHEP;
 * on failure (or timeout) tears it down and attaches HLS instead.
 */
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30000;
// Source-down (503/502/404) retry floor: slow enough not to hammer a downed
// tunnel/node, fast enough that recovery doesn't need a page refresh.
const UNAVAILABLE_RETRY_MS = 15000;

export function attachLiveVideo(
  video: HTMLVideoElement,
  initialSrc: LiveVideoSource,
  cbs: AttachCallbacks = {},
): () => void {
  let src = initialSrc;
  let disposed = false;
  let cleanup: (() => void) | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let backoffMs = RECONNECT_MIN_MS;
  let attemptNo = 0;

  // The browser can't play this stream at all (H.265/HEVC: unsupported over
  // WebRTC AND undecodable in browser HLS). Stop everything and show ONE
  // actionable message instead of looping on "connecting" forever.
  const UNSUPPORTED_MSG =
    "Шууд дамжуулал амжилтгүй. Энэ камер H.265 (HEVC) кодектой бол вэб хөтөч " +
    "дээр харагдахгүй — камерынхаа тохиргооноос H.264 болгоно уу.";

  // The playlist couldn't be fetched — name the real reason (an offline AI node,
  // not a codec problem) so the operator knows what to fix.
  function unavailableMsg(httpStatus: number | null): string {
    if (httpStatus === 503)
      return "AI зангилаа офлайн байна — стрим дамжуулагдахгүй. Зангилаагаа эхлүүлээд хуудсаа сэргээнэ үү.";
    if (httpStatus === 502)
      return "Камерын стрим зангилаа дээр алга — камер дамжуулж байгаа эсэхийг шалгана уу.";
    if (httpStatus === 404) return "Камерын стрим олдсонгүй.";
    return `Стримийг ачаалж чадсангүй${httpStatus ? ` (HTTP ${httpStatus})` : ""}.`;
  }

  function giveUp(message: string) {
    if (disposed) return;
    disposed = true; // halts attempt() + scheduleReconnect()
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    cleanup?.();
    cleanup = null;
    cbs.onError?.(new Error(message));
  }

  // Reconnect the WHOLE pipeline (WHEP-first again) after an ESTABLISHED stream
  // drops — without this a single blip leaves a permanent black tile, breaking
  // the 24h ≥99%/cam uptime target.
  function scheduleReconnect() {
    if (disposed || reconnectTimer) return;
    cleanup?.();
    cleanup = null;
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      backoffMs = Math.min(backoffMs * 2, RECONNECT_MAX_MS);
      // Re-mint the stream URLs first — the embedded read token may have
      // expired while the tile was up (or while the source was down).
      if (cbs.refreshSource) {
        try {
          const fresh = await cbs.refreshSource();
          if (fresh) src = fresh;
        } catch {
          /* keep the current URLs; the attempt below will retry anyway */
        }
      }
      if (!disposed) attempt();
    }, backoffMs);
  }

  function attempt() {
    if (disposed) return;
    attemptNo += 1;
    let fellBack = false;
    let connectedOnce = false;

    function startHls() {
      if (disposed) return;
      fellBack = true;
      cbs.onTransport?.("hls");

      // Watchdog: HLS attached but never produced a decodable frame. Covers the
      // H.265 case where hls.js neither fires a clean codec error nor plays —
      // the tile would otherwise sit on "connecting" forever. Only armed on the
      // INITIAL connect (a previously-healthy stream that drops keeps retrying).
      let frameWatchdog: ReturnType<typeof setTimeout> | null = null;
      const stopWatchdog = () => {
        if (frameWatchdog) {
          clearTimeout(frameWatchdog);
          frameWatchdog = null;
        }
        video.removeEventListener("playing", stopWatchdog);
      };
      if (!connectedOnce) {
        video.addEventListener("playing", stopWatchdog);
        frameWatchdog = setTimeout(() => {
          if (disposed) return;
          if (video.readyState < 2) {
            // Terminal (H.265) only on the very first attempt — on a RETRY the
            // same symptom is usually just a source that's still down.
            if (attemptNo <= 1) giveUp(UNSUPPORTED_MSG);
            else scheduleReconnect();
          }
        }, 12000);
      }

      try {
        cleanup = attachHls(video, src.hlsUrl, {
          onFatal: () => {
            stopWatchdog();
            scheduleReconnect();
          },
          onUnsupported: () => {
            stopWatchdog();
            giveUp(UNSUPPORTED_MSG);
          },
          onUnavailable: (status) => {
            // Stream source is down (node/tunnel offline, camera not publishing).
            // Show the real reason but KEEP retrying — an agent restart or a
            // tunnel blip must not require a manual page refresh: the tile
            // self-heals the moment the source is back (video `playing` event).
            stopWatchdog();
            cbs.onError?.(new Error(unavailableMsg(status)));
            backoffMs = Math.max(backoffMs, UNAVAILABLE_RETRY_MS);
            scheduleReconnect();
          },
        });
      } catch {
        // Browser can't do HLS at all — terminal, don't loop.
        stopWatchdog();
        giveUp(UNSUPPORTED_MSG);
      }
    }

    // Cloud HTTPS HLS proxy → WebRTC can't traverse it, so don't waste a 4s probe.
    if (src.hlsOnly) {
      startHls();
      return;
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
