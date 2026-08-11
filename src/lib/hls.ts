import Hls from "hls.js";

export type HlsCallbacks = {
  /** Fired when an error is fatal and in-place recovery has been exhausted —
   * the caller should tear down and re-attach (reconnect). */
  onFatal?: (err: Error) => void;
  /** The browser cannot DECODE this stream's codec (e.g. H.265/HEVC over MSE) —
   * reconnecting will never help, so the caller should surface a terminal,
   * actionable message instead of looping forever on "connecting". */
  onUnsupported?: (err: Error) => void;
  /** The PLAYLIST (.m3u8) itself couldn't be fetched — the stream source isn't
   * available: the AI node is offline (HTTP 503), or it isn't serving this path
   * (502/404). Distinct from a codec error so the UI can name the real cause
   * instead of mislabelling an offline node as "H.265". `status` = the upstream
   * HTTP code if hls.js exposed one, else null. */
  onUnavailable?: (status: number | null) => void;
};

// hls.js error details that mean "this browser can't decode the codec" — almost
// always an H.265/HEVC stream on Chrome/Firefox/Edge (no browser HEVC in MSE).
const CODEC_UNSUPPORTED_DETAILS = new Set<string>([
  "manifestIncompatibleCodecsError",
  "bufferAddCodecError",
  "bufferIncompatibleCodecsError",
]);

// hls.js error details where the PLAYLIST fetch failed → the stream source is
// unavailable (node offline / path not served), NOT a transient segment blip.
const MANIFEST_LOAD_DETAILS = new Set<string>([
  "manifestLoadError",
  "manifestLoadTimeOut",
  "manifestParsingError",
]);

/**
 * Attach an HLS source to a <video> element. Returns a cleanup function.
 *
 * - Modern browsers (Chrome/Firefox/Edge): uses hls.js with low-latency mode
 *   and built-in recovery (network → restart load; media → recoverMediaError).
 *   `onFatal` fires only when recovery is exhausted so the caller can reconnect.
 * - Safari (desktop + iOS): falls back to native HLS via video.src; `error`
 *   event → onFatal.
 */
export function attachHls(
  video: HTMLVideoElement,
  url: string,
  cbs: HlsCallbacks = {},
): () => void {
  if (Hls.isSupported()) {
    const hls = new Hls({
      // The node serves plain 2s fMP4 segments through the Cloudflare tunnel
      // (LL-HLS stalls over that path — each sub-second part pays full proxy
      // RTT). Keep ~3 segments buffered so playback rides out fetch jitter;
      // real low-latency viewing is WebRTC/WHEP's job, not HLS's.
      lowLatencyMode: false,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 8,
      backBufferLength: 10,
    });
    let mediaRecoveries = 0;
    hls.on(Hls.Events.ERROR, (_evt, data) => {
      // Codec the browser can't decode (H.265/HEVC): terminal — no amount of
      // reconnecting fixes it. Surface it distinctly so the UI can tell the
      // operator to switch the camera to H.264, instead of spinning forever.
      if (CODEC_UNSUPPORTED_DETAILS.has(data.details)) {
        cbs.onUnsupported?.(new Error(`HLS codec unsupported: ${data.details}`));
        hls.destroy();
        return;
      }
      if (!data.fatal) return; // hls.js self-heals non-fatal errors
      // The playlist couldn't be fetched → the stream source is unavailable
      // (node offline / not serving this path). Report the upstream HTTP code so
      // the caller shows the real reason, not the generic codec message.
      if (MANIFEST_LOAD_DETAILS.has(data.details)) {
        cbs.onUnavailable?.(data.response?.code ?? null);
        hls.destroy();
        return;
      }
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          hls.startLoad(); // retry the manifest/segment fetch
          break;
        case Hls.ErrorTypes.MEDIA_ERROR:
          if (mediaRecoveries < 2) {
            mediaRecoveries += 1;
            hls.recoverMediaError();
          } else {
            cbs.onFatal?.(new Error("HLS media error (recovery exhausted)"));
          }
          break;
        default:
          cbs.onFatal?.(new Error(`HLS fatal: ${data.details}`));
      }
    });
    hls.loadSource(url);
    hls.attachMedia(video);
    return () => {
      hls.destroy();
    };
  }
  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
    const onErr = () => cbs.onFatal?.(new Error("native HLS error"));
    video.addEventListener("error", onErr);
    return () => {
      video.removeEventListener("error", onErr);
      video.removeAttribute("src");
      video.load();
    };
  }
  throw new Error("HLS not supported in this browser");
}
