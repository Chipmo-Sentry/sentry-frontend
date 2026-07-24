"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { planExtent } from "@/lib/plan-extent";
import type { FloorPlan } from "@/lib/types";
import { zoneColor } from "@/lib/zone-overlay";

/**
 * Read-only 3D view of the 2D-drawn floor plan (owner request 07-21): walls
 * and fixtures are extruded to their real heights (the agent's 3D-calibration
 * feature stores `height_m`; older plans fall back to the same per-type
 * defaults the editor uses), cameras hang at wall height with a translucent
 * view cone. Drag = orbit, wheel = zoom, right-drag = pan.
 *
 * Plain three.js in a useEffect (no react-three-fiber — one dependency, one
 * canvas). The component is loaded via next/dynamic so three.js never enters
 * the main bundle for users who stay in 2D.
 */

// Same defaults as the agent editor's FIX map (assets/floorplan/app.js).
const FIXTURE_DEFAULT_H: Record<string, number> = {
  shelf: 1.8,
  fridge: 2.0,
  checkout: 1.0,
  mannequin: 1.7,
  exit: 0,
  entrance: 0,
  furniture: 0,
  sofa: 0.8,
  chair: 0.9,
  door: 0,
  exterior_door: 0,
  window: 0,
};
const WALL_DEFAULT_H = 2.8;
const WALL_THICKNESS = 0.12;
// Any door-like fixture cuts an OPENING through the wall it sits on (нэвт
// харагдана): the wall renders in pieces around it, with a lintel above.
// Windows keep a sill below and get a translucent glass pane in the opening.
const DOOR_TYPES = new Set(["door", "exterior_door", "exit", "entrance"]);
const DOOR_OPENING_H = 2.05;
const WINDOW_SILL_H = 0.9;

type WithHeight = { height_m?: number | null };
type Poly = [number, number][];

/** Parametric t (≥ eps) where ray o+t·d crosses segment a-b, or null. */
function raySegT(
  o: [number, number],
  d: [number, number],
  a: [number, number],
  b: [number, number],
  eps: number,
): number | null {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const den = d[0] * ry - d[1] * rx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = a[0] - o[0];
  const qy = a[1] - o[1];
  const t = (qx * ry - qy * rx) / den;
  // u = ((a−o) × d) / (d × r) — the retired dashboard code divided by −den,
  // flipping which side of the segment registered a hit; half the walls were
  // silently pass-through. Verified against synthetic rooms (sim 07-23).
  const u = (qx * d[1] - qy * d[0]) / den;
  return t >= eps && u >= 0 && u <= 1 ? t : null;
}

function nearestWallT(
  o: [number, number],
  d: [number, number],
  tmax: number,
  walls: { points: number[][] }[],
  eps: number,
): number {
  let best = tmax;
  for (const w of walls) {
    const pts = w.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const t = raySegT(o, d, pts[i] as [number, number], pts[i + 1] as [number, number], eps);
      if (t !== null && t < best) best = t;
    }
  }
  return best;
}

function rayPolyInterval(
  o: [number, number],
  d: [number, number],
  poly: Poly,
): [number, number] | null {
  const ts: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const t = raySegT(o, d, poly[i]!, poly[(i + 1) % poly.length]!, -1e-9);
    if (t !== null) ts.push(t);
  }
  if (ts.length === 0) return null;
  return [Math.max(0, Math.min(...ts)), Math.max(...ts)];
}

function polyAreaOf(pts: Poly): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

/** The footprint with everything behind a wall cut away (ray sweep) — the
 * blue patch must stop at walls instead of shining through them. */
function occludeFootprint(
  pos: [number, number],
  pts: Poly,
  walls: { points: number[][] }[],
  eps: number,
): Poly {
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
  // The camera's ground point often sits INSIDE its own footprint (a wide
  // lens sees all around its base). A ray from an interior origin crosses
  // the boundary ONCE — min(ts) is then the EXIT, and treating it as the
  // entry made every ray degenerate/dropped, so the whole clip came back
  // empty and the caller fell back to the raw (wall-leaking) patch.
  let insideOrigin = false;
  {
    let odd = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]!;
      const [xj, yj] = pts[j]!;
      if (yi > o[1] !== yj > o[1] && o[0] < ((xj - xi) * (o[1] - yi)) / (yj - yi) + xi) {
        odd = !odd;
      }
    }
    insideOrigin = odd;
  }
  const near: Poly = [];
  const far: Poly = [];
  const N = 90;
  // Interior origin sees all around — sweep the FULL circle, not just the
  // vertex angular range (which has a gap at the reference discontinuity).
  const sweepMin = insideOrigin ? -Math.PI : amin;
  const sweepMax = insideOrigin ? Math.PI : amax;
  for (let k = 0; k <= N; k++) {
    const a = ref + sweepMin + ((sweepMax - sweepMin) * k) / N;
    const d: [number, number] = [Math.cos(a), Math.sin(a)];
    const iv = rayPolyInterval(o, d, pts);
    if (!iv || iv[1] <= 1e-6) continue;
    const nearT = insideOrigin ? 0 : iv[0];
    const tw = nearestWallT(o, d, iv[1], walls, eps);
    if (tw <= nearT + 1e-6) continue;
    near.push([o[0] + d[0] * nearT, o[1] + d[1] * nearT]);
    far.push([o[0] + d[0] * tw, o[1] + d[1] * tw]);
  }
  if (far.length < 2) return [];
  // Interior origin: every near point is the origin itself — the polygon is
  // just the far ring.
  return insideOrigin ? far : near.concat(far.reverse());
}

/** Adaptive wall clipping. Strict first (5 cm — every wall blocks, so the
 * patch CANNOT leak through the camera's own mounting wall to the outside).
 * Only when that swallows nearly everything (the camera was drawn a little
 * on the WRONG side of its wall) fall back to the lenient 0.5 m exemption. */
function clipFootprint(
  pos: [number, number],
  pts: Poly,
  walls: { points: number[][] }[],
): Poly {
  const strict = occludeFootprint(pos, pts, walls, 0.05);
  if (polyAreaOf(strict) >= polyAreaOf(pts) * 0.2 && strict.length >= 3) return strict;
  const lenient = occludeFootprint(pos, pts, walls, 0.5);
  return polyAreaOf(lenient) > polyAreaOf(strict) ? lenient : strict;
}

/** Calibrated ground footprint: the camera image's 4 corners pushed through
 * H⁻¹ (k1-undistorted first) onto the floor — same math as the agent editor's
 * coverage overlay. Null when uncalibrated or a corner sits at/behind the
 * horizon (caller falls back to the cosmetic cone). */
function cameraFootprint(cam: {
  pos: [number, number];
  homography?: number[][] | null;
  k1?: number | null;
}): Poly | null {
  const H = cam.homography;
  if (!H || H.length !== 3) return null;
  const [[a, b, c], [d, e, f], [g, h, i]] = H as [number[], number[], number[]];
  const A = e! * i! - f! * h!;
  const B = c! * h! - b! * i!;
  const C = b! * f! - c! * e!;
  const det = a! * A + d! * B + g! * C;
  if (Math.abs(det) < 1e-12) return null;
  const id = 1 / det;
  const inv = [
    [A * id, B * id, C * id],
    [(f! * g! - d! * i!) * id, (a! * i! - c! * g!) * id, (c! * d! - a! * f!) * id],
    [(d! * h! - e! * g!) * id, (b! * g! - a! * h!) * id, (a! * e! - b! * d!) * id],
  ];
  const k1 = Number(cam.k1) || 0;
  const [px, py] = cam.pos;
  const MAXR = 25;
  // Sample the WHOLE image border: a tilted-up camera's top samples cross the
  // horizon and drop out, while the rest still outline the ground patch —
  // corner-only sampling collapsed such cameras back to the cone.
  const border: Poly = [];
  const NB = 8;
  for (let i = 0; i < NB; i++) border.push([i / NB, 0]);
  for (let i = 0; i < NB; i++) border.push([1, i / NB]);
  for (let i = 0; i < NB; i++) border.push([1 - i / NB, 1]);
  for (let i = 0; i < NB; i++) border.push([0, 1 - i / NB]);
  const out: Poly = [];
  for (const [cx, cy] of border) {
    const dx = cx - 0.5;
    const dy = cy - 0.5;
    const s = 1 + k1 * (dx * dx + dy * dy);
    const ux = 0.5 + dx * s;
    const uy = 0.5 + dy * s;
    const w = inv[2]![0]! * ux + inv[2]![1]! * uy + inv[2]![2]!;
    if (w < 1e-9) continue; // horizon — this sample has no ground image
    let fx = (inv[0]![0]! * ux + inv[0]![1]! * uy + inv[0]![2]!) / w;
    let fy = (inv[1]![0]! * ux + inv[1]![1]! * uy + inv[1]![2]!) / w;
    const ddx = fx - px;
    const ddy = fy - py;
    const dd = Math.hypot(ddx, ddy);
    if (dd > MAXR) {
      fx = px + (ddx / dd) * MAXR;
      fy = py + (ddy / dd) * MAXR;
    }
    out.push([fx, fy]);
  }
  return out.length >= 3 && polyAreaOf(out) > 0.5 ? out : null;
}

/** [t0,t1] spans (0-1 along the segment) where it passes inside `poly`. */
function segSpansInPoly(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  poly: Poly,
): [number, number][] {
  const inside = (px: number, py: number): boolean => {
    let odd = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]!;
      const [xj, yj] = poly[j]!;
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
        odd = !odd;
      }
    }
    return odd;
  };
  const ts: number[] = [];
  const dx = x2 - x1;
  const dy = y2 - y1;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j]!;
    const [bx, by] = poly[i]!;
    const rx = bx - ax;
    const ry = by - ay;
    const den = dx * ry - dy * rx;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((ax - x1) * ry - (ay - y1) * rx) / den;
    const u = ((ax - x1) * dy - (ay - y1) * dx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((a, b) => a - b);
  const bounds = [0, ...ts, 1];
  const spans: [number, number][] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i]!;
    const b = bounds[i + 1]!;
    if (b - a < 1e-6) continue;
    const mid = (a + b) / 2;
    if (inside(x1 + dx * mid, y1 + dy * mid)) spans.push([a, b]);
  }
  return spans;
}

/** Merge overlapping [t0,t1] spans. */
function mergeSpans(spans: [number, number][]): [number, number][] {
  if (spans.length === 0) return spans;
  spans.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [spans[0]!];
  for (let i = 1; i < spans.length; i++) {
    const last = out[out.length - 1]!;
    const cur = spans[i]!;
    if (cur[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], cur[1]);
    else out.push(cur);
  }
  return out;
}

export default function PlanViewport3D({ plan }: { plan: FloorPlan }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const ext = planExtent(plan);
    const cx = ext.x + ext.w / 2;
    const cz = ext.y + ext.h / 2;
    const span = Math.max(ext.w, ext.h);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    scene.fog = new THREE.Fog(0x0a0a0a, span * 2.2, span * 5);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, span * 10);
    camera.position.set(cx + span * 0.55, span * 0.75, cz + span * 0.85);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, 0, cz);
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // never dive below the floor
    controls.minDistance = span * 0.15;
    controls.maxDistance = span * 3;
    controls.enableDamping = true;
    // Shift + left-drag pans (owner request) — release Shift to orbit.
    const onKey = (e: KeyboardEvent) => {
      controls.mouseButtons.LEFT = e.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    // Lights: soft ambient + one sun-like directional for depth cues.
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(cx - span * 0.4, span * 1.2, cz - span * 0.3);
    scene.add(sun);

    // Floor + subtle grid (plan y maps to 3D z; y is up).
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ext.w, ext.h),
      new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    scene.add(floor);
    const grid = new THREE.GridHelper(span, Math.round(span), 0x2a2a2a, 0x1f1f1f);
    grid.position.set(cx, 0.01, cz);
    scene.add(grid);

    const disposables: { dispose(): void }[] = [];
    const track = <T extends { dispose(): void }>(o: T): T => {
      disposables.push(o);
      return o;
    };

    // Walls: each polyline segment becomes thin boxes — SPLIT around any
    // door-like fixture it passes through (нэвт харагдана): the doorway span
    // is open up to DOOR_OPENING_H, with a lintel box above when the wall is
    // taller.
    const doorPolys: Poly[] = plan.fixtures
      .filter((f) => DOOR_TYPES.has(f.type) && f.points.length >= 3)
      .map((f) => f.points as Poly);
    // `window` is newer than the generated FixtureType union — compare as
    // string until the OpenAPI codegen catches up.
    const windowPolys: Poly[] = plan.fixtures
      .filter((f) => (f.type as string) === "window" && f.points.length >= 3)
      .map((f) => f.points as Poly);
    // Walls render translucent (owner request) so the store interior stays
    // visible from any angle; depthWrite off keeps fixtures crisp behind them.
    const wallMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xd4d4d4,
        roughness: 0.85,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    const glassMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x93c5fd,
        transparent: true,
        opacity: 0.25,
        roughness: 0.1,
      }),
    );
    const addWallPiece = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      a: number,
      b: number,
      h: number,
      yBase: number,
      mat: THREE.Material = wallMat,
    ) => {
      const len = Math.hypot(x2 - x1, y2 - y1) * (b - a);
      if (len < 0.01 || h <= 0.01) return;
      const mx = x1 + (x2 - x1) * ((a + b) / 2);
      const my = y1 + (y2 - y1) * ((a + b) / 2);
      const geo = track(new THREE.BoxGeometry(len, h, WALL_THICKNESS));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(mx, yBase + h / 2, my);
      mesh.rotation.y = -Math.atan2(y2 - y1, x2 - x1);
      scene.add(mesh);
    };
    for (const wall of plan.walls) {
      const h = (wall as WithHeight).height_m ?? WALL_DEFAULT_H;
      if (h <= 0) continue;
      const pts = wall.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i]!;
        const [x2, y2] = pts[i + 1]!;
        if (Math.hypot(x2 - x1, y2 - y1) < 1e-6) continue;
        // Doors and windows both interrupt the solid wall; doors win where
        // they overlap (a window span inside a door span is dropped).
        const doorSpans = mergeSpans(
          doorPolys.flatMap((p) => segSpansInPoly(x1, y1, x2, y2, p)),
        );
        const winSpans = mergeSpans(
          windowPolys.flatMap((p) => segSpansInPoly(x1, y1, x2, y2, p)),
        ).filter(([a, b]) => {
          const mid = (a + b) / 2;
          return !doorSpans.some(([da, db]) => mid >= da && mid <= db);
        });
        const openings = [
          ...doorSpans.map(([a, b]) => [a, b, "door"] as const),
          ...winSpans.map(([a, b]) => [a, b, "window"] as const),
        ].sort((p, q) => p[0] - q[0]);
        let cursor = 0;
        for (const [a, b, kind] of openings) {
          addWallPiece(x1, y1, x2, y2, cursor, a, h, 0);
          if (kind === "door") {
            // Doorway: open to DOOR_OPENING_H, lintel above.
            if (h > DOOR_OPENING_H) {
              addWallPiece(x1, y1, x2, y2, a, b, h - DOOR_OPENING_H, DOOR_OPENING_H);
            }
          } else {
            // Window: sill below, glass pane in the opening, lintel above.
            addWallPiece(x1, y1, x2, y2, a, b, Math.min(WINDOW_SILL_H, h), 0);
            const top = Math.min(DOOR_OPENING_H, h);
            if (top > WINDOW_SILL_H) {
              addWallPiece(x1, y1, x2, y2, a, b, top - WINDOW_SILL_H, WINDOW_SILL_H, glassMat);
            }
            if (h > DOOR_OPENING_H) {
              addWallPiece(x1, y1, x2, y2, a, b, h - DOOR_OPENING_H, DOOR_OPENING_H);
            }
          }
          cursor = b;
        }
        addWallPiece(x1, y1, x2, y2, cursor, 1, h, 0);
      }
    }

    // Fixtures: extruded to height_m (or the per-type default). Zero-height
    // types (exit, furniture) draw as flat tinted plates so they stay visible.
    for (const f of plan.fixtures) {
      if (f.points.length < 3) continue;
      const h = (f as WithHeight).height_m ?? FIXTURE_DEFAULT_H[f.type] ?? 1.0;
      const color = new THREE.Color(zoneColor(f.type));
      const shape = new THREE.Shape(
        f.points.map(([x, y]) => new THREE.Vector2(x, -y)),
      );
      const mat = track(
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.7,
          transparent: true,
          opacity: h > 0 ? 0.85 : 0.4,
        }),
      );
      if (h > 0) {
        const geo = track(
          new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }),
        );
        const mesh = new THREE.Mesh(geo, mat);
        // Shape lives in XY with y negated; stand it up: rotate so extrusion
        // (local +z) points up and the negated y comes back to plan z.
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);
        const edges = new THREE.LineSegments(
          track(new THREE.EdgesGeometry(geo)),
          track(new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })),
        );
        edges.rotation.x = -Math.PI / 2;
        scene.add(edges);
      } else {
        const geo = track(new THREE.ShapeGeometry(shape));
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.02;
        scene.add(mesh);
      }
    }

    // Cameras: a small body near the ceiling + translucent view cone to the
    // floor along dir_deg. Mount height ≈ wall height (solvePnP height isn't
    // in the plan payload; this is a display approximation).
    const camMat = track(new THREE.MeshStandardMaterial({ color: 0x3b82f6 }));
    const coneMat = track(
      new THREE.MeshBasicMaterial({
        color: 0x2563eb,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    for (const cam of plan.cameras) {
      const [px, py] = cam.pos;
      // Calibrated cameras carry their solvePnP-measured mount height (agent
      // v0.7.102), capped at the plan's tallest wall — a camera cannot hang
      // above the ceiling; uncalibrated ones sit just under the wall height.
      let wallMax = WALL_DEFAULT_H;
      for (const w of plan.walls) {
        const wh = Number((w as WithHeight).height_m);
        if (isFinite(wh) && wh > wallMax) wallMax = wh;
      }
      const solved = (cam as { cam_h_m?: number | null }).cam_h_m;
      const mountH =
        typeof solved === "number" && solved > 0
          ? Math.min(solved, wallMax)
          : WALL_DEFAULT_H - 0.2;
      const body = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.35, 0.22, 0.22)),
        camMat,
      );
      body.position.set(px, mountH, py);
      body.rotation.y = -((cam.dir_deg * Math.PI) / 180);
      scene.add(body);
      // Calibrated camera → its REAL ground footprint (H⁻¹ + k1) painted on
      // the floor with faint sight lines — CUT BY WALLS (хана нэвтэлдэггүй):
      // the ray sweep stops each sight line at the first wall, so the patch
      // never shines through into the street/next room. Uncalibrated → cone.
      const fpRaw = cameraFootprint(
        cam as { pos: [number, number]; homography?: number[][] | null; k1?: number | null },
      );
      const fp =
        fpRaw && fpRaw.length >= 3
          ? (() => {
              const clipped = clipFootprint([px, py], fpRaw, plan.walls);
              return clipped.length >= 3 ? clipped : fpRaw;
            })()
          : fpRaw;
      if (fp) {
        const shape = new THREE.Shape(fp.map(([fx, fy]) => new THREE.Vector2(fx, -fy)));
        const patch = new THREE.Mesh(
          track(new THREE.ShapeGeometry(shape)),
          track(
            new THREE.MeshBasicMaterial({
              color: 0x2563eb,
              transparent: true,
              opacity: 0.16,
              depthWrite: false,
            }),
          ),
        );
        patch.rotation.x = -Math.PI / 2;
        patch.position.y = 0.03;
        scene.add(patch);
        const loop = new THREE.LineLoop(
          track(
            new THREE.BufferGeometry().setFromPoints(
              fp.map(([fx, fy]) => new THREE.Vector3(fx, 0.04, fy)),
            ),
          ),
          track(
            new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.6 }),
          ),
        );
        scene.add(loop);
        // A handful of sight lines (the clipped outline can be ~180 points —
        // one line per point would wallpaper the scene).
        const step = Math.max(1, Math.floor(fp.length / 6));
        for (let si = 0; si < fp.length; si += step) {
          const [fx, fy] = fp[si]!;
          scene.add(
            new THREE.Line(
              track(
                new THREE.BufferGeometry().setFromPoints([
                  new THREE.Vector3(px, mountH, py),
                  new THREE.Vector3(fx, 0.04, fy),
                ]),
              ),
              track(
                new THREE.LineBasicMaterial({
                  color: 0x3b82f6,
                  transparent: true,
                  opacity: 0.22,
                }),
              ),
            ),
          );
        }
      } else {
        // View cone: apex at the camera, opening toward the floor along dir.
        const reach = Math.min(6, span * 0.3);
        const cone = new THREE.Mesh(
          track(new THREE.ConeGeometry(reach * 0.45, reach, 24, 1, true)),
          coneMat,
        );
        // Cone points -y by default after this rotation chain: lay it so the
        // axis tilts 55° down from horizontal along dir_deg.
        const dir = (cam.dir_deg * Math.PI) / 180;
        const tilt = (55 * Math.PI) / 180;
        const axis = new THREE.Vector3(
          Math.cos(dir) * Math.cos(tilt),
          -Math.sin(tilt),
          Math.sin(dir) * Math.cos(tilt),
        ).normalize();
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), axis);
        cone.position.set(
          px + axis.x * (reach / 2),
          mountH + axis.y * (reach / 2),
          py + axis.z * (reach / 2),
        );
        scene.add(cone);
      }
    }

    let raf = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      controls.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [plan]);

  return (
    <div className="relative rounded-lg border border-(--color-border) bg-(--color-surface)">
      <div ref={hostRef} className="h-[70vh] w-full overflow-hidden rounded-lg" />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded-md border border-(--color-border) bg-(--color-background)/85 px-2 py-1 text-[11px] text-(--color-muted-foreground)">
        Чирэх — эргүүлэх · Shift+чирэх / баруун чирэх — зөөх · Гүйлгэх — томруулах
      </div>
    </div>
  );
}
