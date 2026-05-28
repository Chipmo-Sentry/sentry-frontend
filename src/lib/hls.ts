import Hls from "hls.js";

/**
 * Attach an HLS source to a <video> element. Returns a cleanup function.
 *
 * - Modern browsers (Chrome/Firefox/Edge): uses hls.js with low-latency mode.
 * - Safari (desktop + iOS): falls back to native HLS via video.src.
 */
export function attachHls(video: HTMLVideoElement, url: string): () => void {
  if (Hls.isSupported()) {
    const hls = new Hls({
      lowLatencyMode: true,
      liveSyncDuration: 1,
      liveMaxLatencyDuration: 5,
      backBufferLength: 10,
    });
    hls.loadSource(url);
    hls.attachMedia(video);
    return () => {
      hls.destroy();
    };
  }
  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }
  throw new Error("HLS not supported in this browser");
}
