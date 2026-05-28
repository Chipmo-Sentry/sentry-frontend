"use client";

import { Badge } from "@chipmo-sentry/ui-kit";
import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { attachHls } from "@/lib/hls";

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
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
