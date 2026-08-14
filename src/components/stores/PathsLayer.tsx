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
// Gender → trace colour (owner spec): male blue, female red, unclassified
// keeps the neutral green so the map still works before face hits appear.
const GENDER_RGB: Record<string, string> = {
  male: "59, 130, 246",
  female: "239, 68, 68",
};
const DEFAULT_RGB = "74, 222, 128";

/** Visit-start hour → hue: morning ≈ blue (200°) sliding to evening ≈ red (0°),
 * clamped to typical store hours so pre-open/после-close visits stay legible. */
function hourHue(startedAt: string): number {
  const hour = new Date(startedAt).getHours();
  const h = Math.min(22, Math.max(7, hour));
  return 200 - ((h - 7) / 15) * 200;
}

export function PathsLayer({
  plan,
  data,
  ageBand = null,
  gender = null,
  minDurationSec = null,
  colorByHour = false,
}: {
  plan: FloorPlan;
  data: PathsSummary;
  /** When set, only paths of this age band draw (child|youth|adult|senior). */
  ageBand?: string | null;
  /** When set, only paths of this gender draw (male|female|unknown). */
  gender?: string | null;
  /** When set, only visits that stayed at least this long draw. */
  minDurationSec?: number | null;
  /** Colour traces by visit-start hour instead of gender. */
  colorByHour?: boolean;
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
        if (ageBand && p.age_band !== ageBand) return null;
        if (gender === "unknown" ? p.gender != null : gender && p.gender !== gender)
          return null;
        if (minDurationSec != null && p.duration_sec < minDurationSec) return null;
        const rgb = (p.gender && GENDER_RGB[p.gender]) || DEFAULT_RGB;
        const d = p.points
          .map((pt, j) => `${j === 0 ? "M" : "L"} ${pt[0]! * w} ${pt[1]! * h}`)
          .join(" ");
        const recency = (i + 1) / n; // API returns newest first → invert below
        const alpha = 0.18 + 0.3 * (1 - recency);
        const stroke = colorByHour
          ? `hsla(${hourHue(p.started_at)}, 85%, 60%, ${alpha})`
          : `rgba(${rgb}, ${alpha})`;
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={stroke}
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
