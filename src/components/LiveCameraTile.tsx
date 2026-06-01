"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { attachHls } from "@/lib/hls";
import { useLiveMetadata } from "@/lib/live-ws";

export type LiveCameraTileProps = {
  cameraId: string;
  name: string;
  hlsUrl: string;
};

type Status = "loading" | "playing" | "stalled" | "error";

const STATUS_LABEL: Record<Status, string> = {
  loading: "Холбогдож байна",
  playing: "Шууд",
  stalled: "Тогтож байна",
  error: "Алдаа",
};

const STATUS_TONE: Record<
  Status,
  "neutral" | "success" | "warning" | "danger"
> = {
  loading: "neutral",
  playing: "success",
  stalled: "warning",
  error: "danger",
};

export function LiveCameraTile({ cameraId, name, hlsUrl }: LiveCameraTileProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { latest, state: wsState } = useLiveMetadata(cameraId);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let detach: (() => void) | null = null;
    let stalledTimer: ReturnType<typeof setTimeout> | null = null;

    function onPlaying() {
      setStatus("playing");
      if (stalledTimer) {
        clearTimeout(stalledTimer);
        stalledTimer = null;
      }
    }
    function onWaiting() {
      // Brief stalls are normal — only flag as stalled if it persists.
      stalledTimer = setTimeout(() => setStatus("stalled"), 2000);
    }
    function onError() {
      setStatus("error");
      setErrorMsg("Видео ачаалж чадсангүй");
    }

    try {
      detach = attachHls(video, hlsUrl);
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "HLS дэмжлэггүй");
      return;
    }
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("error", onError);
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;

    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("error", onError);
      if (stalledTimer) clearTimeout(stalledTimer);
      detach?.();
    };
  }, [hlsUrl]);

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(document.fullscreenElement === wrapRef.current);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  async function toggleFullscreen() {
    if (!wrapRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await wrapRef.current.requestFullscreen();
    }
  }

  // Canvas overlay loop — redraws on each metadata update + window resize.
  // Uses requestAnimationFrame batch so we draw only after layout settles.
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    let raf = 0;
    function draw() {
      raf = 0;
      if (!canvas || !video || !latest) return;

      // Match canvas backing-store to displayed size (CSS) so 1 logical px = 1 device px*
      const rect = video.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssW = Math.floor(rect.width);
      const cssH = Math.floor(rect.height);
      if (cssW <= 0 || cssH <= 0) return;
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      // Scale source coords → displayed coords. object-contain may letterbox;
      // compute the actual displayed video area inside the <video> element.
      const srcW = latest.width;
      const srcH = latest.height;
      const videoRatio = srcW / srcH;
      const cssRatio = cssW / cssH;
      let drawW = cssW;
      let drawH = cssH;
      let offX = 0;
      let offY = 0;
      if (videoRatio > cssRatio) {
        // video is wider — letterbox top/bottom
        drawH = cssW / videoRatio;
        offY = (cssH - drawH) / 2;
      } else {
        drawW = cssH * videoRatio;
        offX = (cssW - drawW) / 2;
      }
      const sx = drawW / srcW;
      const sy = drawH / srcH;

      for (const t of latest.tracks) {
        const [x1, y1, x2, y2] = t.box;
        const rx = offX + x1 * sx;
        const ry = offY + y1 * sy;
        const rw = (x2 - x1) * sx;
        const rh = (y2 - y1) * sy;

        const color =
          t.color === "red"
            ? "#ef4444"
            : t.color === "yellow"
              ? "#eab308"
              : "#22c55e";

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(rx, ry, rw, rh);

        // Raw accumulated risk score (no '%' — thresholds are absolute, see /behaviors).
        const label =
          t.risk_pct > 0
            ? `#${t.person_id} · ${t.risk_pct.toFixed(1)}`
            : `#${t.person_id}`;
        ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
        const labelW = ctx.measureText(label).width + 8;
        const labelH = 18;
        const labelY = Math.max(0, ry - labelH);
        ctx.fillStyle = color;
        ctx.fillRect(rx, labelY, labelW, labelH);
        ctx.fillStyle = "#000";
        ctx.fillText(label, rx + 4, labelY + 13);
      }
    }

    function schedule() {
      if (raf) return;
      raf = requestAnimationFrame(draw);
    }

    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(video);
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [latest]);

  return (
    <div
      ref={wrapRef}
      className="group relative h-full w-full overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] bg-black shadow-sm"
    >
      <video
        ref={videoRef}
        onDoubleClick={toggleFullscreen}
        className="h-full w-full cursor-pointer object-contain"
        data-camera-id={cameraId}
      />
      {/* AI overlay — bounding boxes from /ws/live/{cam} metadata */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* Top overlay — name pill (left) + status pill (right) + fullscreen toggle.
       * Solid translucent backdrops on each pill ensure readability on bright
       * camera footage (ceiling/wall scenes are typically near-white). */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 transition-opacity ${
          isFullscreen ? "opacity-0 group-hover:opacity-100" : "opacity-100"
        }`}
      >
        <div className="flex items-center gap-2 rounded-md bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              status === "playing"
                ? "bg-green-400"
                : status === "stalled"
                  ? "bg-yellow-400"
                  : status === "error"
                    ? "bg-red-500"
                    : "bg-gray-400"
            }`}
            aria-hidden
          />
          {name}
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {/* AI detection count + ws state */}
          <span
            className={`rounded-md px-2 py-1 text-xs font-medium backdrop-blur-sm ${
              wsState === "connected"
                ? "bg-black/60 text-white"
                : "bg-yellow-500/80 text-black"
            }`}
            title={
              wsState === "connected"
                ? `AI холбогдсон · ${latest?.fps_inference.toFixed(1) ?? "—"} FPS`
                : `AI: ${wsState}`
            }
          >
            🤖 {latest ? latest.tracks.length : "—"}
          </span>
          <span
            className={`rounded-md px-2 py-1 text-xs font-medium backdrop-blur-sm ${
              status === "playing"
                ? "bg-green-500/80 text-white"
                : status === "stalled"
                  ? "bg-yellow-500/80 text-black"
                  : status === "error"
                    ? "bg-red-500/80 text-white"
                    : "bg-black/60 text-white"
            }`}
          >
            {STATUS_LABEL[status]}
          </span>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-md bg-black/60 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
            aria-label={isFullscreen ? "Жижигрүүлэх" : "Дэлгэцээр"}
            title={isFullscreen ? "Жижигрүүлэх (Esc)" : "Бүтэн дэлгэц"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {status === "error" && errorMsg && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center text-sm text-white">
          {errorMsg}
        </div>
      )}
    </div>
  );
}
