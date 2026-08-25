"use client";

import { planExtent } from "@/lib/plan-extent";
import type { FloorPlan, RiskSummary } from "@/lib/types";

/**
 * Risk incident layer: one soft red dot per risk episode at the spot the person
 * stood at their PEAK risk (projected server-side via the camera homography).
 * Radius and opacity scale with the peak percentage, so a cluster of serious
 * episodes reads as a hot blotch while stray yellows stay faint — «хулгай аль
 * буланд оролддог вэ» in one glance. Same product risk-red as the live overlay
 * (#EF4444), sequential by magnitude; identity is carried by position, not hue.
 */
export function RiskLayer({ plan, data }: { plan: FloorPlan; data: RiskSummary }) {
  const [w, h] = plan.size;
  const ext = planExtent(plan);
  const base = Math.min(ext.w, ext.h);

  if (data.points.length === 0) return null;

  return (
    <g>
      {data.points.map((p, i) => {
        // 0-100 → radius: yellow-band blips small, CRITICAL big but capped so
        // one point never dominates a small plan.
        const t = Math.min(1, Math.max(0, p.pct / 100));
        const r = base * (0.012 + 0.02 * t);
        return (
          <g key={i}>
            <circle
              cx={p.x * w}
              cy={p.y * h}
              r={r * 2.2}
              fill={`rgba(239,68,68,${0.06 + 0.1 * t})`}
            />
            <circle
              cx={p.x * w}
              cy={p.y * h}
              r={r}
              fill={`rgba(239,68,68,${0.35 + 0.45 * t})`}
              stroke="rgba(255,255,255,0.5)"
              strokeWidth={base * 0.0015}
            />
          </g>
        );
      })}
    </g>
  );
}
