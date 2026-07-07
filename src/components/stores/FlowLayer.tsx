"use client";

import type { FloorPlan, FlowSummary } from "@/lib/types";

/**
 * Movement-flow overlay (docs/30 F4 flow). Rendered INSIDE the
 * FloorPlanViewport SVG. Edge endpoints arrive normalized to the plan [0,1]²;
 * we scale them to plan coords via the plan `size`. Line thickness + opacity
 * scale with the transition count; a small arrowhead marks direction. Only the
 * top edges are drawn (backend already caps + orders) so the graph stays
 * readable.
 */
export function FlowLayer({
  plan,
  flow,
  topN = 60,
}: {
  plan: FloorPlan;
  flow: FlowSummary;
  topN?: number;
}) {
  const [w, h] = plan.size;
  const max = flow.max_count || 1;
  const edges = flow.edges.slice(0, topN);
  if (edges.length === 0) return null;

  return (
    <g>
      <defs>
        <marker
          id="flow-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(96,165,250,0.9)" />
        </marker>
      </defs>
      {edges.map((e, i) => {
        const t = e.count / max;
        const x1 = e.x1 * w;
        const y1 = e.y1 * h;
        const x2 = e.x2 * w;
        const y2 = e.y2 * h;
        // Thickness in plan units — scale to the plan's shorter side so it reads
        // consistently regardless of plan dimensions.
        const width = (0.4 + 2.6 * t) * (Math.min(w, h) / 100);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgba(96,165,250,0.9)"
            strokeWidth={width}
            strokeLinecap="round"
            opacity={0.25 + 0.6 * t}
            markerEnd="url(#flow-arrow)"
          />
        );
      })}
    </g>
  );
}
