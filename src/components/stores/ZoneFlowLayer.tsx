"use client";

import { planExtent } from "@/lib/plan-extent";
import type { FloorPlan, ZoneFlowSummary } from "@/lib/types";

/**
 * Zone-to-zone movement overlay (docs/30 F4, zone level) — the professional
 * replacement for the cell-lattice arrows. The backend has already collapsed
 * the grid onto the operator-drawn fixtures and cancelled opposite flows, so
 * this layer draws a handful of NAMED arrows: «Орц → Тавиур А». Curved,
 * tapered-by-volume, with the zone labels pinned at the centroids — the same
 * grammar retail-analytics products use.
 */
export function ZoneFlowLayer({
  plan,
  flow,
}: {
  plan: FloorPlan;
  flow: ZoneFlowSummary;
}) {
  const [w, h] = plan.size;
  const ext = planExtent(plan);
  const base = Math.min(ext.w, ext.h);
  const thickBase = base / 90;
  const fontSize = base / 26;
  const nodeR = base / 70;

  if (flow.edges.length === 0) return null;
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const maxCount = flow.max_count || 1;
  const total = flow.edges.reduce((s, e) => s + e.count, 0) || 1;

  return (
    <g>
      <defs>
        <marker
          id="zflow-arrow"
          viewBox="0 0 10 10"
          refX="7.5"
          refY="5"
          markerWidth="3.4"
          markerHeight="3.4"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(125,180,255,0.95)" />
        </marker>
      </defs>
      {flow.edges.map((e, i) => {
        const a = byId.get(e.from_id);
        const b = byId.get(e.to_id);
        if (!a || !b) return null;
        const t = e.count / maxCount;
        const x1 = a.x * w;
        const y1 = a.y * h;
        const x2 = b.x * w;
        const y2 = b.y * h;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        // Bow each arrow slightly to its left so parallel flows don't stack,
        // and stop short of the node so the head doesn't pierce the label.
        const nx = -dy / len;
        const ny = dx / len;
        const bow = len * 0.16;
        const mx = (x1 + x2) / 2 + nx * bow;
        const my = (y1 + y2) / 2 + ny * bow;
        const trim = nodeR * 2.2;
        const tx1 = x1 + (dx / len) * trim;
        const ty1 = y1 + (dy / len) * trim;
        const tx2 = x2 - (dx / len) * trim;
        const ty2 = y2 - (dy / len) * trim;
        const share = Math.round((e.count / total) * 100);
        return (
          <g key={i}>
            <path
              d={`M ${tx1} ${ty1} Q ${mx} ${my} ${tx2} ${ty2}`}
              fill="none"
              stroke="rgba(125,180,255,0.8)"
              strokeWidth={(0.5 + 2.3 * t) * thickBase}
              strokeLinecap="round"
              markerEnd="url(#zflow-arrow)"
            />
            {share >= 8 ? (
              <text
                x={mx}
                y={my - fontSize * 0.35}
                textAnchor="middle"
                fontSize={fontSize * 0.9}
                fontWeight={600}
                fill="#dbeafe"
                stroke="rgba(10,15,30,0.75)"
                strokeWidth={fontSize / 8}
                paintOrder="stroke"
              >
                {share}%
              </text>
            ) : null}
          </g>
        );
      })}
      {flow.nodes.map((n) => (
        <g key={n.id}>
          <circle
            cx={n.x * w}
            cy={n.y * h}
            r={nodeR}
            fill="rgba(125,180,255,0.95)"
            stroke="rgba(10,15,30,0.7)"
            strokeWidth={nodeR * 0.35}
          />
          <text
            x={n.x * w}
            y={n.y * h + nodeR + fontSize * 1.1}
            textAnchor="middle"
            fontSize={fontSize}
            fontWeight={600}
            fill="#f1f5f9"
            stroke="rgba(10,15,30,0.8)"
            strokeWidth={fontSize / 7}
            paintOrder="stroke"
          >
            {n.label}
          </text>
        </g>
      ))}
    </g>
  );
}
