"use client";

import { Grid3x3, Square } from "lucide-react";
import { useState } from "react";

import { LiveCameraTile } from "@/components/LiveCameraTile";

/**
 * M1-LIVE Phase L1 — hardcoded camera list (will move to /api/v1/cameras in L2).
 * NEXT_PUBLIC_MEDIAMTX_HLS_BASE — env override for non-localhost dev.
 */
const MEDIAMTX_HLS_BASE =
  process.env.NEXT_PUBLIC_MEDIAMTX_HLS_BASE ?? "http://localhost:8888";

type Camera = { id: string; name: string };

const CAMERAS: readonly Camera[] = [
  { id: "cam1_hik", name: "Камер 1 — Hikvision (LAN)" },
  { id: "cam2_unv", name: "Камер 2 — UNV (LAN)" },
];

// Asserted non-null — CAMERAS is a non-empty constant.
const FIRST_CAM = CAMERAS[0] as Camera;

type Layout = "single" | "grid";

export default function LivePage() {
  const [layout, setLayout] = useState<Layout>("single");
  const [selectedId, setSelectedId] = useState<string>(FIRST_CAM.id);

  const selected = CAMERAS.find((c) => c.id === selectedId) ?? FIRST_CAM;
  const hlsUrl = (id: string) => `${MEDIAMTX_HLS_BASE}/${id}/index.m3u8`;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Compact header */}
      <header className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-base font-semibold leading-tight">Шууд харах</h1>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {CAMERAS.length} камер · MediaMTX HLS
            </p>
          </div>
          {/* Camera selector — only shown in single mode */}
          {layout === "single" && (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm font-medium text-[var(--color-foreground)] focus:border-[var(--color-ring)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/30"
            >
              {CAMERAS.map((c) => (
                <option key={c.id} value={c.id}>
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
        // Single mode: one tile fills the entire viewport (no scroll)
        <div className="flex-1 bg-[var(--color-muted)] p-2">
          <LiveCameraTile
            key={selected.id}
            cameraId={selected.id}
            name={selected.name}
            hlsUrl={hlsUrl(selected.id)}
          />
        </div>
      ) : (
        // Grid mode: 3 columns (responsive), 16:9 tiles, vertical scroll
        <div className="flex-1 overflow-auto bg-[var(--color-muted)] p-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CAMERAS.map((c) => (
              <div key={c.id} className="aspect-video">
                <LiveCameraTile
                  cameraId={c.id}
                  name={c.name}
                  hlsUrl={hlsUrl(c.id)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
