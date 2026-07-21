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
};
const WALL_DEFAULT_H = 2.8;
const WALL_THICKNESS = 0.12;

type WithHeight = { height_m?: number | null };

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

    // Walls: each polyline segment becomes a thin box at its own height.
    const wallMat = track(
      new THREE.MeshStandardMaterial({ color: 0xd4d4d4, roughness: 0.85 }),
    );
    for (const wall of plan.walls) {
      const h = (wall as WithHeight).height_m ?? WALL_DEFAULT_H;
      if (h <= 0) continue;
      const pts = wall.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i]!;
        const [x2, y2] = pts[i + 1]!;
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 1e-6) continue;
        const geo = track(new THREE.BoxGeometry(len, h, WALL_THICKNESS));
        const mesh = new THREE.Mesh(geo, wallMat);
        mesh.position.set((x1 + x2) / 2, h / 2, (y1 + y2) / 2);
        mesh.rotation.y = -Math.atan2(y2 - y1, x2 - x1);
        scene.add(mesh);
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
      const mountH = WALL_DEFAULT_H - 0.2;
      const body = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.35, 0.22, 0.22)),
        camMat,
      );
      body.position.set(px, mountH, py);
      body.rotation.y = -((cam.dir_deg * Math.PI) / 180);
      scene.add(body);
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
        Чирэх — эргүүлэх · Гүйлгэх — томруулах · Баруун чирэх — зөөх
      </div>
    </div>
  );
}
