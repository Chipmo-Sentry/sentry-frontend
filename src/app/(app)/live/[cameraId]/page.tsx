"use client";

import { Button, EmptyState, ErrorState, Spinner } from "@chipmo-sentry/ui-kit";
import { ArrowLeft, Cctv } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { LiveCameraTile } from "@/components/LiveCameraTile";
import { cameras as camerasApi } from "@/lib/api";
import type { CameraPublic } from "@/lib/types";

/**
 * FE-L6 — dedicated single-camera live page. `cameraId` route param is the
 * camera's `mediamtx_path` (same id the live worker + WS metadata use), kept
 * consistent with the /live grid which keys tiles by path.
 */
const MEDIAMTX_HLS_BASE =
  process.env.NEXT_PUBLIC_MEDIAMTX_HLS_BASE ?? "http://localhost:8888";
const MEDIAMTX_WHEP_BASE =
  process.env.NEXT_PUBLIC_MEDIAMTX_WHEP_BASE ?? "http://localhost:8889";

export default function LiveCameraPage() {
  const params = useParams<{ cameraId: string }>();
  const path = decodeURIComponent(params.cameraId);

  const [cam, setCam] = useState<CameraPublic | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setCam(undefined);
    let cancelled = false;
    camerasApi.list().then(
      (list: CameraPublic[]) => {
        if (cancelled) return;
        const match = list.find(
          (c) => c.enabled && c.mediamtx_path === path,
        );
        setCam(match ?? null);
      },
      (e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Алдаа");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(() => load(), [load]);

  if (error) {
    return (
      <div className="p-8">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }
  if (cam === undefined) {
    return (
      <div className="p-8">
        <Spinner />
      </div>
    );
  }
  if (cam === null) {
    return (
      <div className="p-8">
        <EmptyState
          icon={Cctv}
          title="Камер олдсонгүй"
          description="Энэ камер идэвхгүй эсвэл устгагдсан байж магадгүй."
          action={
            <Link href="/live">
              <Button>Шууд харах руу буцах</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <header className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2">
        <Link
          href="/live"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Бүх камер
        </Link>
        <span className="text-sm font-medium">{cam.name}</span>
      </header>

      <div className="flex-1 bg-[var(--color-muted)] p-2">
        <LiveCameraTile
          key={path}
          cameraId={path}
          streamCameraId={cam.id}
          name={cam.name}
          whepUrl={`${MEDIAMTX_WHEP_BASE}/${path}/whep`}
          hlsUrl={`${MEDIAMTX_HLS_BASE}/${path}/index.m3u8`}
        />
      </div>
    </div>
  );
}
