"use client";

import { planExtent } from "@/lib/plan-extent";
import type { FloorPlan, PathsSummary } from "@/lib/types";

/**
 * Spaghetti layer (docs/30 F4 paths): every recent visitor's walked polyline
 * as a faint dotted trace. Individually each trace is barely-there; hundreds
 * of them pile up exactly where people really walk, so the store's true
 * corridors emerge from the data — no aggregation artifacts, no grid.
 *
 * Rendering trick: one SVG <path> per visit with a tight round dash pattern
 * reads as a string of dots (like classic traffic-trace plots) at a fraction
 * of the DOM cost of thousands of <circle> elements.
 */
export function PathsLayer({
  plan,
  data,
}: {
  plan: FloorPlan;
  data: PathsSummary;
}) {
  const [w, h] = plan.size;
  const ext = planExtent(plan);
  const base = Math.min(ext.w, ext.h);
  const dotW = base / 260; // dot diameter
  const gap = dotW * 2.6;

  if (data.paths.length === 0) return null;
  // Newest paths draw last (brightest); cap opacity so pile-ups saturate
  // instead of turning into a solid block.
  const n = data.paths.length;

  return (
    <g>
      {data.paths.map((p, i) => {
        if (p.points.length < 2) return null;
        const d = p.points
          .map((pt, j) => `${j === 0 ? "M" : "L"} ${pt[0]! * w} ${pt[1]! * h}`)
          .join(" ");
        const recency = (i + 1) / n; // API returns newest first → invert below
        const alpha = 0.18 + 0.3 * (1 - recency);
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={`rgba(74, 222, 128, ${alpha})`}
            strokeWidth={dotW}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`0.01 ${gap}`}
          />
        );
      })}
    </g>
  );
}
