"use client";

import { Button, EmptyState, ErrorState, Spinner } from "@chipmo-sentry/ui-kit";
import { Cctv } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { LiveBehaviorPanel } from "@/components/LiveBehaviorPanel";
import { LiveCameraTile } from "@/components/LiveCameraTile";
import { behaviors as behaviorsApi, cameras as camerasApi } from "@/lib/api";
import type { CameraPublic, Zone } from "@/lib/types";

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

type LiveCamera = {
  id: string;
  path: string;
  name: string;
  zones?: Zone[] | null;
};

export default function LivePage() {
  const [cams, setCams] = useState<LiveCamera[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // REV.2 — behavior-criteria side panel: which camera it shows (null = closed)
  // + key→Mongolian label maps from /api/v1/behaviors (best-effort: on failure
  // the panel just shows raw keys).
  const [panelCam, setPanelCam] = useState<LiveCamera | null>(null);
  const [behaviorLabels, setBehaviorLabels] = useState<Record<string, string>>({});
  const [levelLabels, setLevelLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    behaviorsApi.get().then(
      (cfg) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const d of cfg.dimensions) map[d.key] = d.label_mn;
        setBehaviorLabels(map);
        setLevelLabels(cfg.level_labels ?? {});
      },
      () => {
        /* keys shown raw */
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(() => {
    setError(null);
    setCams(null);
    let cancelled = false;
    camerasApi.list().then(
      (list: CameraPublic[]) => {
        if (cancelled) return;
        // Only enabled cameras that have a MediaMTX path can be streamed.
        const streamable = list
          .filter((c) => c.enabled && c.mediamtx_path)
          .map((c) => ({
            id: c.id,
            path: c.mediamtx_path as string,
            name: c.name,
            zones: c.zones,
          }));
        setCams(streamable);
      },
      (e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Алдаа");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  const hlsUrl = (path: string) => `${MEDIAMTX_HLS_BASE}/${path}/index.m3u8`;
  const whepUrl = (path: string) => `${MEDIAMTX_WHEP_BASE}/${path}/whep`;

  if (error) {
    return (
      <div className="p-8">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
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

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Compact control bar */}
      <header className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2">
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {cams.length} камер · WebRTC (бага саатал)
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Камер дээр дарж томруулна
        </p>
      </header>

      {/* Body — all cameras in a grid; click a tile's ⛶ to view it full-screen. */}
      <div className="flex-1 overflow-auto bg-[var(--color-muted)] p-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cams.map((c) => (
            <div key={c.path} className="aspect-video">
              <LiveCameraTile
                cameraId={c.path}
                streamCameraId={c.id}
                name={c.name}
                whepUrl={whepUrl(c.path)}
                hlsUrl={hlsUrl(c.path)}
                detailHref={`/live/${encodeURIComponent(c.path)}`}
                onShowPanel={() => setPanelCam(c)}
                zones={c.zones}
              />
            </div>
          ))}
        </div>
      </div>

      {/* REV.2 — live behavior-criteria breakdown for the selected camera */}
      {panelCam && (
        <LiveBehaviorPanel
          key={panelCam.path}
          cameraId={panelCam.path}
          name={panelCam.name}
          labels={behaviorLabels}
          levelLabels={levelLabels}
          onClose={() => setPanelCam(null)}
        />
      )}
    </div>
  );
}
