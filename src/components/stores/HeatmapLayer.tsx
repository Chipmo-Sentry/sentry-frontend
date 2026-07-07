"use client";

import { useMemo } from "react";

import type { FootfallGrid } from "@/lib/types";

/**
 * Dwell heatmap overlay (docs/30 F2). Rendered INSIDE the FloorPlanViewport's
 * SVG (plan coordinate space) via its `overlay` prop, so cells line up with
 * walls/fixtures without any transform math here. Intensity = samples / max,
 * mapped through a viridis-ish ramp with intensity-scaled opacity. A gaussian
 * blur softens the grid into a heat cloud.
 */

// A few viridis stops (dark blue → teal → green → yellow). Interpolated in RGB —
// close enough for a heatmap, no external color lib needed (CSP blocks CDNs).
const RAMP: [number, [number, number, number]][] = [
  [0.0, [68, 1, 84]],
  [0.25, [59, 82, 139]],
  [0.5, [33, 145, 140]],
  [0.75, [94, 201, 98]],
  [1.0, [253, 231, 37]],
];

function ramp(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < RAMP.length; i++) {
    const [p1, c1] = RAMP[i]!;
    const [p0, c0] = RAMP[i - 1]!;
    if (x <= p1) {
      const f = (x - p0) / (p1 - p0 || 1);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * f);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * f);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * f);
      return `rgb(${r},${g},${b})`;
    }
  }
  return "rgb(253,231,37)";
}

export function HeatmapLayer({ grid }: { grid: FootfallGrid }) {
  const cellW = grid.size[0] / grid.grid_size;
  const cellH = grid.size[1] / grid.grid_size;

  const rects = useMemo(() => {
    const max = grid.max_samples || 1;
    return grid.cells.map(([gx, gy, n], idx) => {
      // sqrt so a few very-hot cells don't wash out the mid-range.
      const t = Math.sqrt(n / max);
      return (
        <rect
          key={idx}
          x={gx * cellW}
          y={gy * cellH}
          width={cellW}
          height={cellH}
          fill={ramp(t)}
          opacity={0.2 + 0.65 * t}
        />
      );
    });
  }, [grid, cellW, cellH]);

  if (grid.cells.length === 0) return null;

  return (
    <g style={{ mixBlendMode: "screen" }}>
      <defs>
        <filter id="heat-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={Math.max(cellW, cellH) * 0.6} />
        </filter>
      </defs>
      <g filter="url(#heat-blur)">{rects}</g>
    </g>
  );
}
