"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { planExtent } from "@/lib/plan-extent";
import type {
  FloorFixture,
  FloorFixtureType,
  FloorPlan,
} from "@/lib/types";
import { zoneColor, zoneLabel } from "@/lib/zone-overlay";

// Zone colours/labels come from the shared map (zone-overlay.ts) so a fixture
// drawn in the agent editor reads identically on /live and here. The 6-digit
// hex + alpha-suffix trick keeps fills translucent without an rgba() rewrite.
const fixtureFill = (type: string) => zoneColor(type) + "1F"; // ~12 %
const fixtureStrokeColor = (type: string) => zoneColor(type) + "B3"; // ~70 %

interface Props {
  plan: FloorPlan;
  /** Optional: overlay children rendered inside the same SVG viewport
   * (heatmap, flow lines, live points — added in F2+). */
  overlay?: React.ReactNode;
  /** Fade fixtures/walls so a data overlay (flow routes) reads first — the
   * plan stays for context, the data carries the story. */
  dimPlan?: boolean;
}

/**
 * SVG viewport for a docs/30 floor plan. Renders in the plan's own logical
 * coordinate system (0..size[0], 0..size[1]) — no transform math on the caller.
 * Walls are polylines, fixtures are colour-coded polygons, cameras are icons
 * with a translucent FOV cone (dir_deg → 60° wedge, cosmetic only until Phase B
 * homography lands).
 */
// How far in the plan can be zoomed (fraction of the full extent per axis).
const MAX_ZOOM = 8;

type ViewBox = { x: number; y: number; w: number; h: number };

export function FloorPlanViewport({ plan, overlay, dimPlan = false }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  // Frame the DRAWN store, not the whole canvas: a ~10×10 m store on a 20-200 m
  // canvas rendered as a speck with monstrous canvas-proportioned marks. The
  // viewBox crops to the content extent and every mark (camera dot, FOV cone,
  // strokes, grid) sizes off that extent, so marks stay visually consistent
  // whatever canvas the store was drawn on.
  const ext = useMemo(() => planExtent(plan), [plan]);
  const base = Math.min(ext.w, ext.h) || 100;

  // === Plan-local zoom/pan (owner request: zooming must magnify the PLAN, not
  // the page). `view` is the current viewBox crop; null = the full extent.
  // Wheel zooms toward the cursor, the +/− buttons zoom on the centre, a drag
  // (or one finger, once zoomed) pans, two fingers pinch. Touch-action stays
  // `pan-y` while un-zoomed so the page still scrolls normally over the plan.
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<ViewBox | null>(null);
  useEffect(() => setView(null), [plan]);
  const vb = view ?? ext;

  /** Client (px) → plan coordinates through the SVG's real screen matrix. */
  const toSvg = useCallback((cx: number, cy: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const clampView = useCallback(
    (v: ViewBox): ViewBox | null => {
      const w = Math.min(ext.w, Math.max(ext.w / MAX_ZOOM, v.w));
      const h = w * (ext.h / ext.w);
      const x = Math.min(Math.max(v.x, ext.x), ext.x + ext.w - w);
      const y = Math.min(Math.max(v.y, ext.y), ext.y + ext.h - h);
      // Zoomed all the way back out → drop to the null (full-extent) state so
      // touch-action returns to pan-y and page scrolling works again.
      if (w >= ext.w * 0.999) return null;
      return { x, y, w, h };
    },
    [ext],
  );

  /** Zoom by `factor` keeping the plan point under (cx, cy) stationary. */
  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number) => {
      const p = toSvg(cx, cy);
      setView((prev) => {
        const cur = prev ?? ext;
        const w = cur.w / factor;
        const h = cur.h / factor;
        const px = p ? p.x : cur.x + cur.w / 2;
        const py = p ? p.y : cur.y + cur.h / 2;
        return clampView({
          x: px - ((px - cur.x) / cur.w) * w,
          y: py - ((py - cur.y) / cur.h) * h,
          w,
          h,
        });
      });
    },
    [toSvg, ext, clampView],
  );

  const zoomCenter = useCallback(
    (factor: number) => {
      const r = svgRef.current?.getBoundingClientRect();
      if (!r) return;
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
    },
    [zoomAt],
  );

  // Wheel must preventDefault (stop the page from scrolling under the cursor),
  // and React's synthetic onWheel is passive — attach natively.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1 / 1.2);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Pointer state: one pointer pans (when zoomed), two pinch-zoom.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) setDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const prev = pointers.current.get(e.pointerId);
      if (!prev) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = Array.from(pointers.current.values());
      const [a, b] = pts;
      if (a && b) {
        // Pinch: zoom on the midpoint by the distance ratio.
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist.current != null && pinchDist.current > 0) {
          zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinchDist.current);
        }
        pinchDist.current = dist;
        return;
      }
      if (!view) return; // un-zoomed: leave the gesture to the page (pan-y)
      const r = svgRef.current?.getBoundingClientRect();
      if (!r || r.width === 0) return;
      const scale = vb.w / r.width;
      const dx = (e.clientX - prev.x) * scale;
      const dy = (e.clientY - prev.y) * scale;
      setView((cur) =>
        cur ? clampView({ ...cur, x: cur.x - dx, y: cur.y - dy }) : cur,
      );
    },
    [view, vb.w, clampView, zoomAt],
  );

  const onPointerEnd = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = null;
    if (pointers.current.size === 0) setDragging(false);
  }, []);
  const wallStroke = base * 0.006;
  const fixtureStroke = base * 0.004;
  const gridStep = Math.max(ext.w, ext.h) / 24;

  // Group fixtures by type for a compact legend in the corner.
  const legend = useMemo(() => {
    const counts = new Map<FloorFixtureType, number>();
    for (const f of plan.fixtures) {
      counts.set(f.type, (counts.get(f.type) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [plan.fixtures]);

  const isEmpty =
    plan.walls.length === 0 &&
    plan.fixtures.length === 0 &&
    plan.cameras.length === 0;

  return (
    <div className="relative rounded-lg border border-(--color-border) bg-(--color-surface)">
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className={`block h-auto w-full ${
          view ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""
        }`}
        style={{ touchAction: view ? "none" : "pan-y" }}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Дэлгүүрийн план зураг"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDoubleClick={() => setView(null)}
      >
        {/* Subtle grid — scaled to the plan so an empty plan is still legible. */}
        <defs>
          <pattern
            id="fp-grid"
            width={gridStep}
            height={gridStep}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`}
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={base * 0.002}
            />
          </pattern>
        </defs>
        <rect x={ext.x} y={ext.y} width={ext.w} height={ext.h} fill="url(#fp-grid)" />

        {/* Fixtures (drawn first, walls sit on top). The group fades when a
            data overlay should read first (dimPlan). */}
        <g opacity={dimPlan ? 0.3 : 1}>
          {plan.fixtures.map((f, i) => (
            <FixturePolygon
              key={f.id ?? `f${i}`}
              fixture={f}
              stroke={fixtureStroke}
              hovered={hover === (f.id ?? `f${i}`)}
              onHoverChange={(on) => setHover(on ? (f.id ?? `f${i}`) : null)}
            />
          ))}

          {/* Walls */}
          {plan.walls.map((wall, i) => (
            <polyline
              key={`w${i}`}
              points={wall.points.map(([x, y]) => `${x},${y}`).join(" ")}
              fill="none"
              stroke="rgba(250,250,250,0.85)"
              strokeWidth={wallStroke}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </g>

        {/* Cameras: FOV cone + body + label */}
        {plan.cameras.map((c, i) => (
          <CameraMarker key={c.camera_id + i} camera={c} base={base} />
        ))}

        {overlay}
      </svg>

      {/* Zoom controls — the plan magnifies inside its own frame (wheel /
          pinch / buttons), the page never zooms with it. */}
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <ZoomButton label="Томруулах" onClick={() => zoomCenter(1.4)}>
          <Plus className="h-4 w-4" />
        </ZoomButton>
        <ZoomButton label="Багасгах" onClick={() => zoomCenter(1 / 1.4)}>
          <Minus className="h-4 w-4" />
        </ZoomButton>
        {view ? (
          <ZoomButton label="Бүтэн харах" onClick={() => setView(null)}>
            <Maximize2 className="h-4 w-4" />
          </ZoomButton>
        ) : null}
      </div>

      {isEmpty ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm">
          <span className="text-(--color-muted-foreground)">
            Энэ дэлгүүрт хараахан план зураг зураагүй байна.
          </span>
          <span className="text-xs text-(--color-muted-foreground)">
            agent-pc → «Plan зураг» хуудсанд зурж хадгална.
          </span>
        </div>
      ) : null}

      {/* Legend chip row */}
      {legend.length > 0 ? (
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1.5">
          {legend.map(([type, n]) => (
            <span
              key={type}
              className="inline-flex items-center gap-1.5 rounded-md border border-(--color-border) bg-(--color-background)/85 px-2 py-0.5 text-[11px] text-(--color-muted-foreground)"
            >
              <span
                className="inline-block h-2 w-3 rounded-sm border"
                style={{
                  background: fixtureFill(type),
                  borderColor: fixtureStrokeColor(type),
                }}
              />
              {zoneLabel(type)} · {n}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-(--color-border) bg-(--color-background)/85 text-(--color-muted-foreground) shadow-sm transition-colors hover:text-(--color-foreground)"
    >
      {children}
    </button>
  );
}

function FixturePolygon({
  fixture,
  stroke,
  hovered,
  onHoverChange,
}: {
  fixture: FloorFixture;
  stroke: number;
  hovered: boolean;
  onHoverChange: (on: boolean) => void;
}) {
  return (
    <polygon
      points={fixture.points.map(([x, y]) => `${x},${y}`).join(" ")}
      fill={fixtureFill(fixture.type)}
      stroke={fixtureStrokeColor(fixture.type)}
      strokeWidth={hovered ? stroke * 1.6 : stroke}
      strokeLinejoin="round"
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      {/* Operator-named zones («Архины тавиур») read as themselves on hover. */}
      <title>{fixture.label || zoneLabel(fixture.type)}</title>
    </polygon>
  );
}

function CameraMarker({
  camera,
  base,
}: {
  camera: {
    camera_id: string;
    name?: string | null;
    pos: [number, number];
    dir_deg: number;
  };
  /** Smaller plan dimension — all marks scale off it (see FloorPlanViewport). */
  base: number;
}) {
  const [cx, cy] = camera.pos;
  // 60° FOV wedge + a top-view CCTV glyph (was a bare dot), both sized as a
  // fraction of the plan so they read the same on any store's plan.
  const R = base * 0.12;
  const s = base * 0.028; // glyph half-size unit
  const half = 30; // half-angle deg
  const a1 = ((camera.dir_deg - half) * Math.PI) / 180;
  const a2 = ((camera.dir_deg + half) * Math.PI) / 180;
  const p1 = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)];
  const p2 = [cx + R * Math.cos(a2), cy + R * Math.sin(a2)];
  const fovPath = `M ${cx} ${cy} L ${p1[0]} ${p1[1]} A ${R} ${R} 0 0 1 ${p2[0]} ${p2[1]} Z`;
  return (
    <g>
      <path
        d={fovPath}
        fill="rgba(37,99,235,0.18)"
        stroke="rgba(37,99,235,0.45)"
        strokeWidth={base * 0.003}
      />
      {/* Camera glyph, rotated to face dir_deg (0° = +x, same as the wedge):
          rounded body + a lens barrel poking INTO the FOV cone so the shape
          itself shows which way it looks even before the cone registers. */}
      <g
        transform={`translate(${cx} ${cy}) rotate(${camera.dir_deg})`}
        stroke="#0a0a0a"
        strokeWidth={s * 0.18}
      >
        <rect
          x={-s * 1.1}
          y={-s * 0.75}
          width={s * 1.7}
          height={s * 1.5}
          rx={s * 0.35}
          fill="#2563eb"
        />
        <rect
          x={s * 0.45}
          y={-s * 0.4}
          width={s * 0.75}
          height={s * 0.8}
          rx={s * 0.18}
          fill="#2563eb"
        />
        <circle cx={s * 0.95} cy={0} r={s * 0.22} fill="#bfdbfe" stroke="none" />
      </g>
      {/* Friendly name over the raw mediamtx path when the agent supplied one. */}
      <title>{camera.name || camera.camera_id}</title>
    </g>
  );
}
