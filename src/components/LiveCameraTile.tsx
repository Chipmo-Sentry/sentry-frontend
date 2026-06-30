"use client";

import { Cctv, ExternalLink, ListChecks, Maximize2, Minimize2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { riskColor } from "@chipmo-sentry/ui-kit";

import { ApiError, API_BASE_URL, cameras as camerasApi } from "@/lib/api";
import { attachLiveVideo, type LiveTransport } from "@/lib/live-video";
import { useLiveMetadata } from "@/lib/live-ws";
import type { Zone } from "@/lib/types";
import { coverRect, projectPoint, zoneColor, zoneLabel } from "@/lib/zone-overlay";

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
  /** docs/29 P1d — the camera's detection zones (normalized 0-1 polygons),
   * drawn read-only over the video so the operator sees what the engine uses. */
  zones?: Zone[] | null;
  /** Smart-console thumbnail variant — a slim tile (ambient risk border, no
   * header/overlay/buttons) for the bottom strip. The full tile is the spotlight. */
  compact?: boolean;
  /** Highlight this thumbnail as the active spotlight (compact mode ring). */
  active?: boolean;
  /** Click → pin this camera as the spotlight (compact mode). */
  onSelect?: () => void;
  /** Report this camera's current max risk % + online state up to the parent so
   * it can auto-focus the spotlight and colour the thumbnail border. */
  onRisk?: (risk: number, online: boolean) => void;
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
  zones,
  compact = false,
  active = false,
  onSelect,
  onRisk,
}: LiveCameraTileProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zonesCanvasRef = useRef<HTMLCanvasElement>(null);
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

  // Current max per-person risk on this camera — drives the spotlight auto-focus
  // and the thumbnail ambient border. Reported up so the parent can compare cams.
  // Defensive `?? []`: a malformed metadata frame (camera_id but no tracks) must
  // not crash the tile — the WS layer doesn't runtime-validate `tracks`.
  const maxRisk = (latest?.tracks ?? []).reduce(
    (m, t) => Math.max(m, t.risk_pct),
    0,
  );
  useEffect(() => {
    onRisk?.(maxRisk, status === "playing");
  }, [maxRisk, status, onRisk]);

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
      ({ token, hls_url }) => {
        if (cancelled) return;
        // Prefer the backend's same-origin HTTPS HLS proxy (no mixed-content, no
        // hardcoded ephemeral node port). whep="" makes attachLiveVideo go straight
        // to HLS — WebRTC can't traverse the proxy.
        if (hls_url) {
          setAuthUrls({ whep: "", hls: API_BASE_URL + hls_url });
          return;
        }
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
      { whepUrl: authUrls.whep, hlsUrl: authUrls.hls, hlsOnly: !authUrls.whep },
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

      // Rounded-rect helper for the reference-style pills.
      const pill = (
        x: number,
        y: number,
        w: number,
        h: number,
        r: number,
        fill: string,
      ) => {
        const rad = Math.min(r, h / 2, w / 2);
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, rad);
        ctx.fillStyle = fill;
        ctx.fill();
      };

      for (const t of latest.tracks) {
        const [x1, y1, x2, y2] = t.box;
        const rx = offX + x1 * sx;
        const ry = offY + y1 * sy;
        const rw = (x2 - x1) * sx;
        const rh = (y2 - y1) * sy;

        // Risk % MUST be the per-camera risk_pct so the number and the colour
        // always agree. (We deliberately do NOT use store_risk_pct here: the
        // cross-camera accumulated score ratchets toward a saturated 100% while
        // the box stays low, which reads as "everyone is 100% but green".
        // store_risk_pct lives in the panel.) The band/colour is derived from
        // risk_pct via the shared ui-kit spec — the SAME mapping the agent uses.
        const risk = t.risk_pct;
        const color = riskColor(risk);

        // Box: rounded, band-coloured, 2px.
        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, 6);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Primary pill (reference): solid band-colour, white bold risk %, with
        // the re-ID number tucked in smaller. Prefer the store-global re-ID so
        // the SAME person shows the SAME id across the store's cameras
        // (ADR-0023); fall back to the per-camera ByteTrack id when re-ID is off.
        const pid = t.store_person_id ?? t.person_id;
        const riskTxt = risk > 0 ? `${risk.toFixed(0)}%` : "—";
        const idTxt = `#${pid}`;
        const pad = 8;
        const gap = 5;
        ctx.font = "700 14px ui-sans-serif, system-ui, sans-serif";
        const riskW = ctx.measureText(riskTxt).width;
        ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
        const idW = ctx.measureText(idTxt).width;
        const pillH = 22;
        const pillW = pad + riskW + gap + idW + pad;
        const pillY = Math.max(0, ry - pillH - 3);
        pill(rx, pillY, pillW, pillH, 8, color);
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.font = "700 14px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(riskTxt, rx + pad, pillY + pillH / 2 + 0.5);
        ctx.fillStyle = "rgba(255,255,255,0.78)";
        ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(idTxt, rx + pad + riskW + gap, pillY + pillH / 2 + 0.5);
        ctx.textBaseline = "alphabetic";

        // Accumulated episode score ("how many points banked"), in a neutral
        // dark pill to the right so it reads as a DIFFERENT number from the
        // colour-coded current risk. Sum of the per-criterion scores; the
        // per-criterion breakdown lives in the side panel.
        const points = t.behavior_scores
          ? Object.values(t.behavior_scores).reduce((a, b) => a + (Number(b) || 0), 0)
          : 0;
        if (points > 0) {
          const pts = `${points.toFixed(0)} оноо`;
          ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
          const pw = ctx.measureText(pts).width + 2 * pad;
          pill(rx + pillW + 4, pillY, pw, pillH, 8, "rgba(10,10,10,0.78)");
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#fff";
          ctx.fillText(pts, rx + pillW + 4 + pad, pillY + pillH / 2 + 0.5);
          ctx.textBaseline = "alphabetic";
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
          const lineH = 17;
          let ly = Math.min(cssH - lineH * shown.length, ry + rh + 3);
          for (const line of shown) {
            const w = ctx.measureText(line).width + 2 * pad;
            pill(rx, ly, w, lineH - 2, 6, "rgba(10,10,10,0.7)");
            ctx.textBaseline = "middle";
            ctx.fillStyle = color;
            ctx.fillText(line, rx + pad, ly + (lineH - 2) / 2 + 0.5);
            ctx.textBaseline = "alphabetic";
            ly += lineH;
          }
        }
      }

      // Held items: box + Mongolian name (WHAT is in the shopper's hand). Amber
      // so it reads as distinct from the risk-coloured person boxes. Only `held`
      // items draw, to keep the view clean — all detections stay in metadata.
      const amber = "#FFAA00";
      for (const it of latest.items ?? []) {
        if (!it.held) continue;
        const [ix1, iy1, ix2, iy2] = it.box;
        const rx = offX + ix1 * sx;
        const ry = offY + iy1 * sy;
        const rw = (ix2 - ix1) * sx;
        const rh = (iy2 - iy1) * sy;
        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, 4);
        ctx.strokeStyle = amber;
        ctx.lineWidth = 2;
        ctx.stroke();
        const name = it.label_mn || it.label;
        if (name) {
          const pad = 6;
          const h = 18;
          ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
          const w = ctx.measureText(name).width + 2 * pad;
          const ly = Math.max(0, ry - h - 2);
          pill(rx, ly, w, h, 6, amber);
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#1a1a1a";
          ctx.fillText(name, rx + pad, ly + h / 2 + 0.5);
          ctx.textBaseline = "alphabetic";
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

  // docs/29 P1d — read-only zone overlay. Drawn on its OWN canvas (under the AI
  // boxes) and keyed to the video's intrinsic size, so zones project correctly
  // even before any AI metadata frame arrives (and stay put when AI is off).
  useEffect(() => {
    const canvas = zonesCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    let raf = 0;
    function draw() {
      raf = 0;
      if (!canvas || !video) return;
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

      const r = coverRect(video.videoWidth, video.videoHeight, cssW, cssH);
      if (!r || !zones) return;
      for (const z of zones) {
        if (!z.points || z.points.length < 3) continue;
        const color = zoneColor(z.type);
        ctx.beginPath();
        z.points.forEach(([nx, ny], i) => {
          const [px, py] = projectPoint(nx, ny, r);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fillStyle = `${color}1f`; // ~12% translucent fill
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]); // dashed → reads as an annotation, not a detection
        ctx.stroke();
        ctx.setLineDash([]);
        // Type label at the polygon's top-most vertex.
        const top = z.points.reduce((a, b) => (b[1] < a[1] ? b : a));
        const [lx, ly] = projectPoint(top[0], top[1], r);
        const label = zoneLabel(z.type);
        ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
        const lw = ctx.measureText(label).width + 8;
        ctx.fillStyle = color;
        ctx.fillRect(lx, Math.max(0, ly - 16), lw, 15);
        ctx.fillStyle = "#000";
        ctx.fillText(label, lx + 4, Math.max(11, ly - 5));
      }
    }

    function schedule() {
      if (raf) return;
      raf = requestAnimationFrame(draw);
    }

    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(video);
    // videoWidth becomes known at loadedmetadata — redraw then.
    video.addEventListener("loadedmetadata", schedule);
    return () => {
      ro.disconnect();
      video.removeEventListener("loadedmetadata", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [zones]);

  // Compact thumbnail (smart-console strip): slim live tile, ambient risk
  // border, click to promote to the spotlight. No header/overlay/buttons.
  // HOOK-ORDER INVARIANT: every hook is declared ABOVE this early return, and
  // `compact` never flips for a mounted instance — the page keys spotlight vs
  // strip tiles differently (key="spotlight" vs key=`thumb-${path}`) so React
  // remounts rather than reusing an instance across the variant. Don't let those
  // keys collide, or React will reuse the instance, flip `compact`, and throw
  // "rendered fewer hooks than expected".
  if (compact) {
    const ambient = maxRisk > 0 ? riskColor(maxRisk) : "var(--color-border)";
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`group relative block aspect-video w-full overflow-hidden rounded-lg border-2 bg-black transition-colors duration-500 ${
          active ? "ring-2 ring-white/80" : "hover:brightness-110"
        }`}
        style={{ borderColor: ambient }}
        aria-label={`${name} — томруулах`}
      >
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          data-camera-id={cameraId}
        />
        {maxRisk >= 70 && (
          <span
            className="pointer-events-none absolute inset-0 animate-pulse rounded-md ring-2 ring-red-500/80"
            aria-hidden
          />
        )}
        {status !== "playing" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-(--color-border) border-t-(--color-primary)" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/75 to-transparent px-2 py-1">
          <span className="truncate text-[11px] font-medium text-white">
            {name}
          </span>
          {maxRisk > 0 && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
              style={{ backgroundColor: ambient }}
            >
              {maxRisk.toFixed(0)}%
            </span>
          )}
        </div>
      </button>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="group relative h-full w-full overflow-hidden rounded-(--radius) border border-(--color-border) bg-black shadow-sm"
    >
      <video
        ref={videoRef}
        onDoubleClick={toggleFullscreen}
        className="h-full w-full cursor-pointer object-cover"
        data-camera-id={cameraId}
      />
      {/* docs/29 P1d — read-only detection-zone overlay (under the AI boxes) */}
      <canvas
        ref={zonesCanvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
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
        <div className="flex items-center gap-2 rounded-lg bg-black/60 px-2 py-1.5 text-white backdrop-blur-sm">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-(--color-primary)/25 text-blue-300">
            <Cctv className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="text-xs font-medium leading-none">{name}</span>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Live status badge — pulsing dot, red while streaming (reference UX).
           * Transport + AI throughput moved to the bottom meta strip. */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium backdrop-blur-sm ${
              status === "playing"
                ? "bg-red-500/85 text-white"
                : status === "error"
                  ? "bg-red-600/85 text-white"
                  : "bg-amber-500/85 text-black"
            }`}
            title={
              wsState === "connected"
                ? `AI холбогдсон · ${latest?.fps_inference.toFixed(1) ?? "—"} FPS`
                : `AI: ${wsState}`
            }
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                status === "playing"
                  ? "animate-pulse bg-white"
                  : status === "error"
                    ? "bg-white"
                    : "animate-pulse bg-black/70"
              }`}
              aria-hidden
            />
            {status === "playing" ? "Шууд" : STATUS_LABEL[status]}
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

      {/* Connecting / buffering placeholder — an intentional state instead of an
       * empty black void (reference UX). Hidden once the first frame plays. */}
      {!paymentRequired && status !== "playing" && status !== "error" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
          <div className="relative h-12 w-12">
            <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-(--color-border) border-t-(--color-primary)" />
            <span className="absolute inset-0 flex items-center justify-center text-blue-300">
              <Cctv className="h-5 w-5" aria-hidden />
            </span>
          </div>
          <div>
            <p className="text-sm text-white/90">{STATUS_LABEL[status]}…</p>
            <p className="mt-0.5 text-xs text-white/45">LAN-аас шууд</p>
          </div>
        </div>
      )}

      {paymentRequired ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 p-4 text-center text-sm text-white">
          <span>Үлдэгдэл хүрэлцэхгүй байна — Төлбөр хуудаснаас цэнэглэнэ үү</span>
          <Link
            href="/billing"
            className="rounded-md bg-(--color-primary) px-3 py-1.5 font-medium text-white transition-opacity hover:opacity-90"
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

      {/* Bottom meta strip — transport + live AI throughput (reference UX). */}
      {!isFullscreen && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/65 to-transparent px-3 py-2 text-[11px] font-medium text-white/85">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                status === "playing" ? "bg-green-400" : "bg-gray-500"
              }`}
              aria-hidden
            />
            {transport === "webrtc" ? "WebRTC" : "HLS"}
          </span>
          <span>
            {status === "playing" && latest
              ? `${(latest.fps_inference ?? 0).toFixed(0)} FPS · ${latest.tracks?.length ?? 0} objects`
              : "—"}
          </span>
        </div>
      )}
    </div>
  );
}
