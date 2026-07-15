/**
 * Calibrated camera coverage on the floor plan — a faithful port of the
 * agent editor's overlay math (sentry-agent-pc floorplan/app.js), so the
 * dashboard shows the SAME footprint the operator calibrated:
 *
 *   footprint = the camera image's four corners (0-1) pushed through the
 *   INVERSE homography into plan space — the exact ground patch the camera
 *   sees — then cut by walls with a ray sweep so blind spots read correctly.
 *
 * Uncalibrated cameras (no homography) fall back to the cosmetic wedge the
 * viewport always drew.
 */

type Pt = [number, number];

interface PlanCameraLike {
  pos: [number, number];
  dir_deg?: number;
  homography?: number[][] | null;
}

interface WallLike {
  points: number[][];
}

function invert3x3(m: number[][]): number[][] | null {
  const [[a, b, c], [d, e, f], [g, h, i]] = m as [number[], number[], number[]] as [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
  const A = e * i - f * h;
  const B = c * h - b * i;
  const C = b * f - c * e;
  const det = a * A + d * B + g * C;
  if (Math.abs(det) < 1e-12) return null;
  const id = 1 / det;
  return [
    [A * id, B * id, C * id],
    [(f * g - d * i) * id, (a * i - c * g) * id, (c * d - a * f) * id],
    [(d * h - e * g) * id, (b * g - a * h) * id, (a * e - b * d) * id],
  ];
}

function applyH(m: number[][], p: Pt): Pt | null {
  const [x, y] = p;
  const w = m[2]![0]! * x + m[2]![1]! * y + m[2]![2]!;
  if (Math.abs(w) < 1e-9) return null;
  return [
    (m[0]![0]! * x + m[0]![1]! * y + m[0]![2]!) / w,
    (m[1]![0]! * x + m[1]![1]! * y + m[1]![2]!) / w,
  ];
}

/** Parametric t (≥ eps) where ray o+t·d crosses segment a-b, or null. */
function raySegT(o: Pt, d: Pt, a: Pt, b: Pt, eps: number): number | null {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const den = d[0] * ry - d[1] * rx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = a[0] - o[0];
  const qy = a[1] - o[1];
  const t = (qx * ry - qy * rx) / den;
  const u = (qx * d[1] - qy * d[0]) / -den;
  return t >= eps && u >= 0 && u <= 1 ? t : null;
}

function nearestWallT(o: Pt, d: Pt, tmax: number, walls: WallLike[]): number {
  let best = tmax;
  for (const w of walls) {
    const pts = w.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const t = raySegT(o, d, pts[i] as Pt, pts[i + 1] as Pt, 1e-3);
      if (t !== null && t < best) best = t;
    }
  }
  return best;
}

function rayPolyInterval(o: Pt, d: Pt, poly: Pt[]): [number, number] | null {
  const ts: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const t = raySegT(o, d, poly[i]!, poly[(i + 1) % poly.length]!, -1e-9);
    if (t !== null) ts.push(t);
  }
  if (ts.length === 0) return null;
  return [Math.max(0, Math.min(...ts)), Math.max(...ts)];
}

/** The footprint with everything behind a wall cut away (agent's ray sweep). */
function occludeFootprint(pos: Pt, pts: Pt[], walls: WallLike[]): Pt[] {
  if (walls.length === 0) return pts;
  const o = pos;
  const angles: number[] = [];
  for (const p of pts) {
    const dx = p[0] - o[0];
    const dy = p[1] - o[1];
    if (Math.hypot(dx, dy) > 1e-9) angles.push(Math.atan2(dy, dx));
  }
  if (angles.length === 0) return pts;
  const ref = angles[0]!;
  const rel = (a: number) => {
    let r = a - ref;
    while (r <= -Math.PI) r += 2 * Math.PI;
    while (r > Math.PI) r -= 2 * Math.PI;
    return r;
  };
  const offs = angles.map(rel);
  const amin = Math.min(...offs);
  const amax = Math.max(...offs);
  const near: Pt[] = [];
  const far: Pt[] = [];
  const N = 90;
  for (let k = 0; k <= N; k++) {
    const a = ref + amin + ((amax - amin) * k) / N;
    const d: Pt = [Math.cos(a), Math.sin(a)];
    const iv = rayPolyInterval(o, d, pts);
    if (!iv || iv[1] <= 1e-6) continue;
    const tw = nearestWallT(o, d, iv[1], walls);
    if (tw <= iv[0] + 1e-6) continue;
    near.push([o[0] + d[0] * iv[0], o[1] + d[1] * iv[0]]);
    far.push([o[0] + d[0] * tw, o[1] + d[1] * tw]);
  }
  if (far.length < 2) return [];
  return near.concat(far.reverse());
}

/**
 * The wall-clipped plan polygon a CALIBRATED camera actually covers, or null
 * when the camera has no usable homography (caller falls back to the wedge).
 */
export function calibratedCoverage(
  camera: PlanCameraLike,
  walls: WallLike[],
): Pt[] | null {
  if (!camera.homography) return null;
  const inv = invert3x3(camera.homography);
  if (!inv) return null;
  const corners: Pt[] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const quad: Pt[] = [];
  for (const c of corners) {
    const p = applyH(inv, c);
    if (!p) return null;
    quad.push(p);
  }
  const clipped = occludeFootprint(camera.pos, quad, walls);
  return clipped.length >= 3 ? clipped : null;
}
