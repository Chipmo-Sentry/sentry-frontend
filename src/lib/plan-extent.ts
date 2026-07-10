import type { FloorPlan } from "@/lib/types";

export type PlanExtent = { x: number; y: number; w: number; h: number };

/**
 * Bounding box of everything DRAWN on a floor plan (walls, fixtures, camera
 * positions), padded ~6% (min 1 m). Falls back to the full canvas when the
 * plan is blank.
 *
 * Why: the plan canvas is often much larger than the store drawn on it (a
 * ~10×10 m store on a 20-200 m canvas). Rendering the full canvas made the
 * store a speck and any canvas-proportioned mark (camera dots, FOV cones,
 * flow arrows) monstrous next to it. Everything that frames or sizes against
 * the plan should use this extent, not `plan.size`.
 */
export function planExtent(plan: FloorPlan): PlanExtent {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  let any = false;
  const eat = ([px, py]: [number, number]) => {
    any = true;
    x1 = Math.min(x1, px);
    y1 = Math.min(y1, py);
    x2 = Math.max(x2, px);
    y2 = Math.max(y2, py);
  };
  for (const w of plan.walls) for (const p of w.points) eat(p);
  for (const f of plan.fixtures) for (const p of f.points) eat(p);
  for (const c of plan.cameras) eat(c.pos);

  if (!any) {
    const [w, h] = plan.size;
    return { x: 0, y: 0, w: w || 100, h: h || 100 };
  }
  const w = Math.max(x2 - x1, 1);
  const h = Math.max(y2 - y1, 1);
  const pad = Math.max(Math.min(w, h) * 0.06, 1);
  return { x: x1 - pad, y: y1 - pad, w: w + 2 * pad, h: h + 2 * pad };
}
