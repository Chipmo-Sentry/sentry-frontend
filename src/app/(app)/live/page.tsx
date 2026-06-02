"use client";

import { Button, EmptyState, Spinner } from "@chipmo-sentry/ui-kit";
import { Cctv, Grid3x3, Square } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { LiveCameraTile } from "@/components/LiveCameraTile";
import { cameras as camerasApi } from "@/lib/api";
import type { CameraPublic } from "@/lib/types";

/**
 * M1-LIVE Phase L2 — camera list now comes from /api/v1/cameras.
 * `mediamtx_path` is the live-worker camera_id and drives both the HLS URL
 * and the WS metadata channel (see sentry-backend camera schema).
 * NEXT_PUBLIC_MEDIAMTX_HLS_BASE — env override for non-localhost dev.
 */
const MEDIAMTX_HLS_BASE =
  process.env.NEXT_PUBLIC_MEDIAMTX_HLS_BASE ?? "http://localhost:8888";
// WebRTC/WHEP endpoint (MediaMTX :8889) — primary low-latency transport.
const MEDIAMTX_WHEP_BASE =
  process.env.NEXT_PUBLIC_MEDIAMTX_WHEP_BASE ?? "http://localhost:8889";

type LiveCamera = { path: string; name: string };

type Layout = "single" | "grid";

export default function LivePage() {
  const [cams, setCams] = useState<LiveCamera[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>("single");
  const [selectedPath, setSelectedPath] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    camerasApi.list().then(
      (list: CameraPublic[]) => {
        if (cancelled) return;
        // Only enabled cameras that have a MediaMTX path can be streamed.
        const streamable = list
          .filter((c) => c.enabled && c.mediamtx_path)
          .map((c) => ({ path: c.mediamtx_path as string, name: c.name }));
        setCams(streamable);
        setSelectedPath((prev) => prev || streamable[0]?.path || "");
      },
      (e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Алдаа");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const hlsUrl = (path: string) => `${MEDIAMTX_HLS_BASE}/${path}/index.m3u8`;
  const whepUrl = (path: string) => `${MEDIAMTX_WHEP_BASE}/${path}/whep`;

  if (error) {
    return <p className="p-8 text-[var(--color-danger)]">{error}</p>;
  }
  if (cams === null) {
    return (
      <div className="p-8">
        <Spinner />
      </div>
    );
  }
  if (cams.length === 0) {
    return (
      <div className="p-8">
        <EmptyState
          icon={Cctv}
          title="Идэвхтэй камер алга"
          description="Шууд харахын тулд идэвхтэй, MediaMTX замтай камер бүртгэнэ үү."
          action={
            <Link href="/cameras">
              <Button>Камер удирдах</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const selected =
    cams.find((c) => c.path === selectedPath) ?? (cams[0] as LiveCamera);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Compact control bar */}
      <header className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2">
        <div className="flex items-center gap-4">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {cams.length} камер · WebRTC (бага саатал)
          </p>
          {layout === "single" && (
            <select
              value={selected.path}
              onChange={(e) => setSelectedPath(e.target.value)}
              className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm font-medium text-[var(--color-foreground)] focus:border-[var(--color-ring)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/30"
            >
              {cams.map((c) => (
                <option key={c.path} value={c.path}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Layout switcher */}
        <div className="flex items-center gap-1 rounded-[var(--radius)] border border-[var(--color-border)] p-0.5">
          <button
            type="button"
            onClick={() => setLayout("single")}
            title="Нэг камер"
            aria-pressed={layout === "single"}
            className={`flex items-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-2.5 py-1 text-xs transition-colors ${
              layout === "single"
                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
            }`}
          >
            <Square className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Нэг камер</span>
          </button>
          <button
            type="button"
            onClick={() => setLayout("grid")}
            title="Бүх камер"
            aria-pressed={layout === "grid"}
            className={`flex items-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-2.5 py-1 text-xs transition-colors ${
              layout === "grid"
                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
            }`}
          >
            <Grid3x3 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Бүх камер</span>
          </button>
        </div>
      </header>

      {/* Body */}
      {layout === "single" ? (
        <div className="flex-1 bg-[var(--color-muted)] p-2">
          <LiveCameraTile
            key={selected.path}
            cameraId={selected.path}
            name={selected.name}
            whepUrl={whepUrl(selected.path)}
            hlsUrl={hlsUrl(selected.path)}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-auto bg-[var(--color-muted)] p-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {cams.map((c) => (
              <div key={c.path} className="aspect-video">
                <LiveCameraTile
                  cameraId={c.path}
                  name={c.name}
                  whepUrl={whepUrl(c.path)}
                  hlsUrl={hlsUrl(c.path)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
