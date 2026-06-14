"use client";

import { ExternalLink, ListChecks, Maximize2, Minimize2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ApiError, cameras as camerasApi } from "@/lib/api";
import { attachLiveVideo, type LiveTransport } from "@/lib/live-video";
import { useLiveMetadata } from "@/lib/live-ws";

export type LiveCameraTileProps = {
  cameraId: string;
  name: string;
  whepUrl: string;
  hlsUrl: string;
  /** Camera DB id. When set, the tile fetches a short-lived read token and
   * appends `?jwt=…` to the stream URLs (authenticated WHEP/HLS). */
  streamCameraId?: string;
  /** When set, render a link to the dedicated single-camera page (FE-L6). */
  detailHref?: string;
  /** When set, render a 📋 button that opens the behavior-criteria side panel
   * for this camera (REV.2 — live criteria display). */
  onShowPanel?: () => void;
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

export function LiveCameraTile({
  cameraId,
  name,
  whepUrl,
  hlsUrl,
  streamCameraId,
  detailHref,
  onShowPanel,
}: LiveCameraTileProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // 402 from the stream-token endpoint — wallet is empty, live is paywalled.
  const [paymentRequired, setPaymentRequired] = useState(false);
  const [transport, setTransport] = useState<LiveTransport>("webrtc");
  // Resolved stream URLs (with ?jwt=… when a read token is required). Null until
  // resolved so we don't attach the raw URL then immediately re-attach.
  const [authUrls, setAuthUrls] = useState<{ whep: string; hls: string } | null>(
    streamCameraId ? null : { whep: whepUrl, hls: hlsUrl },
  );

  const { latest, state: wsState } = useLiveMetadata(cameraId);

  // Fetch a short-lived read token and append it to the stream URLs. On failure
  // fall back to the raw URLs (local/dev MediaMTX without authHTTP still works).
  useEffect(() => {
    if (!streamCameraId) {
      setAuthUrls({ whep: whepUrl, hls: hlsUrl });
      return;
    }
    let cancelled = false;
    setPaymentRequired(false);
    camerasApi.streamToken(streamCameraId).then(
      ({ token }) => {
        if (cancelled) return;
        const q = `?jwt=${encodeURIComponent(token)}`;
        setAuthUrls({ whep: whepUrl + q, hls: hlsUrl + q });
      },
      (e: unknown) => {
        if (cancelled) return;
        // 402 — хэтэвчний үлдэгдэл дууссан тул live хаалттай. authUrls-ийг
        // null-аар нь үлдээж видеог ОГТ эхлүүлэхгүй, тусгай overlay үзүүлнэ.
        if (e instanceof ApiError && e.status === 402) {
          setPaymentRequired(true);
          setStatus("error");
          return;
        }
        setAuthUrls({ whep: whepUrl, hls: hlsUrl });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [streamCameraId, whepUrl, hlsUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !authUrls) return;

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

    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("error", onError);

    detach = attachLiveVideo(
      video,
      { whepUrl: authUrls.whep, hlsUrl: authUrls.hls },
      {
        onTransport: setTransport,
        onError: (e) => {
          setStatus("error");
          setErrorMsg(e.message);
        },
      },
    );

    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("error", onError);
      if (stalledTimer) clearTimeout(stalledTimer);
      detach?.();
    };
  }, [authUrls]);

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

      // Scale source coords → displayed coords. The <video> is object-cover:
      // it scales to FILL the tile (scale = max) and crops the overflow, so the
      // displayed area is >= the tile and centered (negative offsets).
      const srcW = latest.width;
      const srcH = latest.height;
      const scale = Math.max(cssW / srcW, cssH / srcH);
      const drawW = srcW * scale;
      const drawH = srcH * scale;
      const offX = (cssW - drawW) / 2;
      const offY = (cssH - drawH) / 2;
      const sx = scale;
      const sy = scale;

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

        // Prefer the store-global re-ID number so the SAME person shows the SAME
        // id across the store's cameras (ADR-0023); fall back to the per-camera
        // ByteTrack id when re-ID is off.
        const pid = t.store_person_id ?? t.person_id;
        // Risk % MUST be the per-camera risk_pct — the SAME score that drives
        // `color` — so the number and the colour always agree. (We deliberately
        // do NOT use store_risk_pct here: the cross-camera accumulated score
        // ratchets toward a saturated 100% while the box stays green, which read
        // as "everyone is 100% but green". store_risk_pct lives in the panel.)
        const risk = t.risk_pct;
        const label =
          risk > 0 ? `#${pid} · ${risk.toFixed(0)}%` : `#${pid}`;
        ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
        const labelW = ctx.measureText(label).width + 8;
        const labelH = 18;
        const labelY = Math.max(0, ry - labelH);
        ctx.fillStyle = color;
        ctx.fillRect(rx, labelY, labelW, labelH);
        ctx.fillStyle = "#000";
        ctx.fillText(label, rx + 4, labelY + 13);

        // Accumulated episode score ("how many points banked"), in a neutral
        // pill right after the risk label so it reads as a DIFFERENT number from
        // the colour-coded current risk. Sum of the per-criterion scores; the
        // per-criterion breakdown lives in the side panel. Unlike the decaying
        // risk %, this is the episode total, so it's the "оноо цуглуулсан" view.
        const points = t.behavior_scores
          ? Object.values(t.behavior_scores).reduce((a, b) => a + (Number(b) || 0), 0)
          : 0;
        if (points > 0) {
          const pts = `${points.toFixed(0)} оноо`;
          ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
          const pw = ctx.measureText(pts).width + 8;
          const px = rx + labelW + 3;
          ctx.fillStyle = "rgba(0,0,0,0.72)";
          ctx.fillRect(px, labelY, pw, labelH);
          ctx.fillStyle = "#fff";
          ctx.fillText(pts, px + 4, labelY + 13);
        }

        // REV.2 — active criteria under the box: the engine's Mongolian reason
        // strings (e.g. "Орчноо харах", "Халаас руу"). Max 2 lines + "+n" so a
        // busy episode doesn't wallpaper the video; full list lives in the
        // side panel (ListChecks button).
        const reasons = t.reasons ?? [];
        if (reasons.length > 0) {
          const shown = reasons.slice(0, 2);
          const extra = reasons.length - shown.length;
          if (extra > 0) shown[shown.length - 1] += `  +${extra}`;
          ctx.font = "500 11px ui-sans-serif, system-ui, sans-serif";
          const lineH = 15;
          let ly = Math.min(cssH - lineH * shown.length, ry + rh + 2);
          for (const line of shown) {
            const w = ctx.measureText(line).width + 8;
            ctx.fillStyle = "rgba(0,0,0,0.65)";
            ctx.fillRect(rx, ly, w, lineH);
            ctx.fillStyle = color;
            ctx.fillText(line, rx + 4, ly + 11);
            ly += lineH;
          }
        }
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
        className="h-full w-full cursor-pointer object-cover"
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
          {/* Transport indicator — WebRTC (low latency) vs HLS fallback */}
          <span
            className="rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm"
            title={
              transport === "webrtc"
                ? "WebRTC — бага саатал (sub-second)"
                : "HLS — нөөц горим (WebRTC амжилтгүй)"
            }
          >
            {transport === "webrtc" ? "⚡ RTC" : "HLS"}
          </span>
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
          {onShowPanel && !isFullscreen && (
            <button
              type="button"
              onClick={onShowPanel}
              className="rounded-md bg-black/60 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
              aria-label="Сэжиг шалгуурууд"
              title="Сэжиг шалгуурын задаргааг харах"
            >
              <ListChecks className="h-4 w-4" />
            </button>
          )}
          {detailHref && !isFullscreen && (
            <Link
              href={detailHref}
              className="rounded-md bg-black/60 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
              aria-label="Дэлгэрэнгүй харах"
              title="Энэ камерыг тусдаа хуудсанд нээх"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
          )}
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

      {paymentRequired ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 p-4 text-center text-sm text-white">
          <span>Үлдэгдэл хүрэлцэхгүй байна — Төлбөр хуудаснаас цэнэглэнэ үү</span>
          <Link
            href="/billing"
            className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 font-medium text-white transition-opacity hover:opacity-90"
          >
            Цэнэглэх
          </Link>
        </div>
      ) : (
        status === "error" &&
        errorMsg && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center text-sm text-white">
            {errorMsg}
          </div>
        )
      )}
    </div>
  );
}
