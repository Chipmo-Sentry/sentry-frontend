"use client";

import { planExtent } from "@/lib/plan-extent";
import type { FloorPlan, FlowSummary } from "@/lib/types";

/**
 * Movement-flow overlay (docs/30 F4 flow), rendered INSIDE the
 * FloorPlanViewport SVG.
 *
 * The raw response is a directed cell-adjacency graph — drawing every edge as
 * its own arrow made an unreadable starburst (both directions of every aisle,
 * no threshold, giant arrowheads). This renderer turns the graph into what an
 * operator actually asks: «хүмүүс голдуу ХААГУУР явдаг вэ?»
 *
 *   1. NET flow: opposite edges cancel — an aisle walked 40× north and 35×
 *      south is one northbound line worth 5, not two fat arrows.
 *   2. Threshold: edges under 15% of the strongest net edge are noise — gone.
 *   3. Routes: surviving edges are greedily chained head-to-tail (bounded turn
 *      angle) into the store's top corridors, drawn as smooth paths with a
 *      share label; leftovers draw as faint short arrows.
 */

type Pt = { x: number; y: number };
type NetEdge = { a: Pt; b: Pt; count: number; used?: boolean };

const NOISE_FLOOR = 0.15; // of max net count — below this an edge isn't drawn
const MAX_ROUTES = 5;
const MAX_ROUTE_SEGS = 12;
const MAX_TURN_DEG = 75; // a route may bend, but not fold back on itself

const key = (p: Pt) => `${p.x.toFixed(4)}:${p.y.toFixed(4)}`;

function angleDeg(u: Pt, v: Pt, w: Pt): number {
  const a1 = Math.atan2(v.y - u.y, v.x - u.x);
  const a2 = Math.atan2(w.y - v.y, w.x - v.x);
  let d = Math.abs(a1 - a2) * (180 / Math.PI);
  if (d > 180) d = 360 - d;
  return d;
}

/** Merge opposite directed edges into net-flow edges (direction of the winner). */
function netEdges(flow: FlowSummary): NetEdge[] {
  const seen = new Map<string, { a: Pt; b: Pt; fwd: number; rev: number }>();
  for (const e of flow.edges) {
    const a = { x: e.x1, y: e.y1 };
    const b = { x: e.x2, y: e.y2 };
    const ka = key(a);
    const kb = key(b);
    const [k, flip] = ka < kb ? [`${ka}|${kb}`, false] : [`${kb}|${ka}`, true];
    let rec = seen.get(k);
    if (!rec) {
      rec = flip ? { a: b, b: a, fwd: 0, rev: 0 } : { a, b, fwd: 0, rev: 0 };
      seen.set(k, rec);
    }
    if (flip) rec.rev += e.count;
    else rec.fwd += e.count;
  }
  const out: NetEdge[] = [];
  for (const r of seen.values()) {
    const net = r.fwd - r.rev;
    if (net === 0) continue;
    out.push(net > 0 ? { a: r.a, b: r.b, count: net } : { a: r.b, b: r.a, count: -net });
  }
  return out.sort((x, y) => y.count - x.count);
}

/** Greedy chain: strongest unused edge seeds a route, extended both ways along
 * the strongest angle-compatible continuation. */
function chainRoutes(edges: NetEdge[]): { pts: Pt[]; count: number }[] {
  const byStart = new Map<string, NetEdge[]>();
  const byEnd = new Map<string, NetEdge[]>();
  for (const e of edges) {
    const ks = key(e.a);
    const ke = key(e.b);
    (byStart.get(ks) ?? byStart.set(ks, []).get(ks)!).push(e);
    (byEnd.get(ke) ?? byEnd.set(ke, []).get(ke)!).push(e);
  }
  const routes: { pts: Pt[]; count: number }[] = [];
  for (const seed of edges) {
    if (seed.used) continue;
    seed.used = true;
    const pts: Pt[] = [seed.a, seed.b];
    const counts: number[] = [seed.count];
    while (pts.length < MAX_ROUTE_SEGS + 1) {
      const head = pts[pts.length - 1]!;
      const prev = pts[pts.length - 2]!;
      const next = (byStart.get(key(head)) || [])
        .filter((e) => !e.used && angleDeg(prev, head, e.b) <= MAX_TURN_DEG)
        .sort((x, y) => y.count - x.count)[0];
      if (!next) break;
      next.used = true;
      pts.push(next.b);
      counts.push(next.count);
    }
    while (pts.length < MAX_ROUTE_SEGS + 1) {
      const tail = pts[0]!;
      const after = pts[1]!;
      const prevE = (byEnd.get(key(tail)) || [])
        .filter((e) => !e.used && angleDeg(e.a, tail, after) <= MAX_TURN_DEG)
        .sort((x, y) => y.count - x.count)[0];
      if (!prevE) break;
      prevE.used = true;
      pts.unshift(prevE.a);
      counts.unshift(prevE.count);
    }
    routes.push({ pts, count: counts.reduce((s, c) => s + c, 0) / counts.length });
    if (routes.length >= MAX_ROUTES) break;
  }
  return routes;
}

/** Catmull-Rom → cubic bezier path so corridors read as one smooth stroke. */
function smoothPath(pts: Pt[], sx: number, sy: number): string {
  if (pts.length === 2) {
    return `M ${pts[0]!.x * sx} ${pts[0]!.y * sy} L ${pts[1]!.x * sx} ${pts[1]!.y * sy}`;
  }
  let d = `M ${pts[0]!.x * sx} ${pts[0]!.y * sy}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const c1x = (p1.x + (p2.x - p0.x) / 6) * sx;
    const c1y = (p1.y + (p2.y - p0.y) / 6) * sy;
    const c2x = (p2.x - (p3.x - p1.x) / 6) * sx;
    const c2y = (p2.y - (p3.y - p1.y) / 6) * sy;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x * sx} ${p2.y * sy}`;
  }
  return d;
}

export function FlowLayer({
  plan,
  flow,
}: {
  plan: FloorPlan;
  flow: FlowSummary;
  /** Kept for call-site compat; the net/route pipeline ignores it. */
  topN?: number;
}) {
  const [w, h] = plan.size;
  const ext = planExtent(plan);
  const thickBase = Math.min(ext.w, ext.h) / 110;
  const fontSize = Math.min(ext.w, ext.h) / 22;

  // SMIL ignores prefers-reduced-motion — honor it ourselves (static arrows).
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const nets = netEdges(flow);
  if (nets.length === 0) return null;
  const maxNet = nets[0]!.count;
  const strong = nets.filter((e) => e.count >= maxNet * NOISE_FLOOR);
  const routes = chainRoutes(strong);
  const leftovers = strong.filter((e) => !e.used);
  const totalRouteCount = routes.reduce((s, r) => s + r.count, 0) || 1;

  return (
    <g>
      <defs>
        <marker
          id="flow-arrow"
          viewBox="0 0 10 10"
          refX="7"
          refY="5"
          markerWidth="4.5"
          markerHeight="4.5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(96,165,250,0.95)" />
        </marker>
      </defs>
      {leftovers.map((e, i) => (
        <line
          key={`r${i}`}
          x1={e.a.x * w}
          y1={e.a.y * h}
          x2={e.b.x * w}
          y2={e.b.y * h}
          stroke="rgba(96,165,250,0.85)"
          strokeWidth={thickBase * 0.6}
          strokeLinecap="round"
          opacity={0.3}
          markerEnd="url(#flow-arrow)"
        />
      ))}
      {routes.map((r, i) => {
        const t = r.count / (routes[0]!.count || 1);
        const share = Math.round((r.count / totalRouteCount) * 100);
        const mid = r.pts[Math.floor(r.pts.length / 2)]!;
        const d = smoothPath(r.pts, w, h);
        // Motion carries the story: dots stream along the corridor — the eye
        // reads direction and volume instantly, without decoding arrowheads.
        // Dot count/speed scale with traffic; the faint track gives context.
        const dots = 3 + Math.round(4 * t);
        const roughLen = r.pts.length - 1; // segments ≈ relative length
        const durSec = Math.max(3, roughLen * (2.2 - 1.2 * t));
        const dotR = (0.55 + 0.55 * t) * thickBase * 1.6;
        return (
          <g key={`p${i}`}>
            <path
              d={d}
              fill="none"
              stroke={reduceMotion ? "rgba(96,165,250,0.9)" : "rgba(96,165,250,0.45)"}
              strokeWidth={thickBase * (reduceMotion ? 0.9 + 1.6 * t : 0.9)}
              strokeLinecap="round"
              strokeLinejoin="round"
              markerEnd={reduceMotion ? "url(#flow-arrow)" : undefined}
            />
            {!reduceMotion &&
              Array.from({ length: dots }, (_, j) => (
                <circle key={j} r={dotR} fill="rgba(147,197,253,0.95)">
                  <animateMotion
                    dur={`${durSec}s`}
                    begin={`${(durSec / dots) * j - durSec}s`}
                    repeatCount="indefinite"
                    path={d}
                  />
                </circle>
              ))}
            <text
              x={mid.x * w + fontSize * 0.4}
              y={mid.y * h - fontSize * 0.4}
              fontSize={fontSize}
              fontWeight={600}
              fill="#dbeafe"
              stroke="rgba(0,0,0,0.65)"
              strokeWidth={fontSize / 7}
              paintOrder="stroke"
            >
              {share}%
            </text>
          </g>
        );
      })}
    </g>
  );
}
