"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fixtureName, fixtureNames } from "@/lib/fixture-names";
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
  /** Print each zone's name on the drawing («Тавиур 2», «Орц/Гарц», the
   * operator's own «Архины тавиур») — the owner reads the analytics tables
   * against the plan, so the plan has to say which shelf is which. */
  showLabels?: boolean;
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

export function FloorPlanViewport({
  plan,
  overlay,
  dimPlan = false,
  showLabels = true,
}: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const names = useMemo(() => fixtureNames(plan), [plan]);

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
  // Architectural style (owner reference 07-22, colours unchanged): walls at
  // their REAL 0.12 m thickness (plan units are metres), square joints.
  const wallStroke = 0.12;
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
        className={`block h-auto max-h-[70vh] w-full ${
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

          {/* Walls — blueprint-thick, square-jointed */}
          {plan.walls.map((wall, i) => (
            <polyline
              key={`w${i}`}
              points={wall.points.map(([x, y]) => `${x},${y}`).join(" ")}
              fill="none"
              stroke="rgba(250,250,250,0.85)"
              strokeWidth={wallStroke}
              strokeLinecap="butt"
              strokeLinejoin="miter"
            />
          ))}
        </g>

        {/* Zone names at each fixture's centroid. Kept OUT of the dimmed group
            (only softened) so the names still anchor a data overlay. */}
        {showLabels ? (
          <g opacity={dimPlan ? 0.55 : 1} style={{ pointerEvents: "none" }}>
            {plan.fixtures.map((f, i) => (
              <FixtureLabel
                key={`l${f.id ?? i}`}
                fixture={f}
                name={fixtureName(names, f, i)}
                base={base}
              />
            ))}
          </g>
        ) : null}

        {/* Overall dimension lines (blueprint style): width below, height
            left — drawn only when something IS drawn. */}
        {!isEmpty ? <DimensionLines plan={plan} ext={ext} base={base} /> : null}

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

/** Blueprint-style overall dimensions: store width under the plan, height on
 * the left — the «6.000 / 9.000» lines of an architectural drawing. Sized off
 * the DRAWN content bbox (not the padded extent) so the numbers are the real
 * store size in metres. */
function DimensionLines({
  plan,
  ext,
  base,
}: {
  plan: FloorPlan;
  ext: { x: number; y: number; w: number; h: number };
  base: number;
}) {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  const eat = ([px, py]: [number, number]) => {
    x1 = Math.min(x1, px);
    y1 = Math.min(y1, py);
    x2 = Math.max(x2, px);
    y2 = Math.max(y2, py);
  };
  for (const w of plan.walls) for (const p of w.points) eat(p);
  for (const f of plan.fixtures) for (const p of f.points) eat(p);
  for (const c of plan.cameras) eat(c.pos);
  if (!isFinite(x1) || x2 - x1 < 0.5 || y2 - y1 < 0.5) return null;

  const stroke = "rgba(163,163,163,0.75)";
  const sw = base * 0.004;
  const tick = base * 0.014;
  const font = Math.max(base * 0.032, 0.3);
  // Sit the lines in the middle of the extent's padding band.
  const yd = y2 + (ext.y + ext.h - y2) * 0.55;
  const xd = ext.x + (x1 - ext.x) * 0.45;
  return (
    <g style={{ pointerEvents: "none" }}>
      {/* width (bottom) */}
      <line x1={x1} y1={yd} x2={x2} y2={yd} stroke={stroke} strokeWidth={sw} />
      <line x1={x1} y1={yd - tick} x2={x1} y2={yd + tick} stroke={stroke} strokeWidth={sw} />
      <line x1={x2} y1={yd - tick} x2={x2} y2={yd + tick} stroke={stroke} strokeWidth={sw} />
      <text
        x={(x1 + x2) / 2}
        y={yd - tick * 0.6}
        textAnchor="middle"
        fontSize={font}
        fill={stroke}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {(x2 - x1).toFixed(1)} м
      </text>
      {/* height (left) */}
      <line x1={xd} y1={y1} x2={xd} y2={y2} stroke={stroke} strokeWidth={sw} />
      <line x1={xd - tick} y1={y1} x2={xd + tick} y2={y1} stroke={stroke} strokeWidth={sw} />
      <line x1={xd - tick} y1={y2} x2={xd + tick} y2={y2} stroke={stroke} strokeWidth={sw} />
      <text
        x={xd - tick * 0.6}
        y={(y1 + y2) / 2}
        textAnchor="middle"
        fontSize={font}
        fill={stroke}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        transform={`rotate(-90 ${xd - tick * 0.6} ${(y1 + y2) / 2})`}
      >
        {(y2 - y1).toFixed(1)} м
      </text>
    </g>
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

/** Zone name printed at the polygon's area centroid. Sized to fit INSIDE the
 * fixture (shrinks along its long side, floors at a still-legible size) and
 * turned vertical for tall narrow shelves so the text runs along them. White
 * with a dark halo, the same grammar as the flow/route labels. */
function FixtureLabel({
  fixture,
  name,
  base,
}: {
  fixture: FloorFixture;
  name: string;
  /** Smaller plan dimension — all marks scale off it (see FloorPlanViewport). */
  base: number;
}) {
  const pts = fixture.points;
  if (pts.length < 3 || !name) return null;
  // Signed-area centroid (a plain vertex mean drifts on L-shaped polygons).
  let area = 0;
  let cx = 0;
  let cy = 0;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (!a || !b) continue;
    const [ax, ay] = a;
    const [bx, by] = b;
    const cross = ax * by - bx * ay;
    area += cross;
    cx += (ax + bx) * cross;
    cy += (ay + by) * cross;
    x1 = Math.min(x1, ax);
    y1 = Math.min(y1, ay);
    x2 = Math.max(x2, ax);
    y2 = Math.max(y2, ay);
  }
  if (Math.abs(area) > 1e-9) {
    cx /= 3 * area;
    cy /= 3 * area;
  } else {
    cx = (x1 + x2) / 2;
    cy = (y1 + y2) / 2;
  }
  const w = x2 - x1;
  const h = y2 - y1;
  const vertical = h > w * 1.4;
  const along = vertical ? h : w;
  const across = vertical ? w : h;
  // Too thin to carry text (a window, a wall-hugging strip): the legend and
  // the hover title still name it.
  if (across < base * 0.012) return null;
  const chars = Math.max(name.length, 3) * 0.58; // ≈ em per character
  const font = Math.max(
    Math.min(base * 0.03, (along * 0.9) / chars, across * 0.8),
    base * 0.014,
  );
  return (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={font}
      fontWeight={600}
      fill="#f8fafc"
      stroke="rgba(10,15,30,0.8)"
      strokeWidth={font / 7}
      paintOrder="stroke"
      fontFamily="ui-sans-serif, system-ui, sans-serif"
      transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
    >
      {name}
    </text>
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
  const s = base * 0.00728; // glyph half-size unit (owner: v2 × 1.3)
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
          soft halo (keeps the small mark findable on a busy plan) + rounded
          body + a flaring lens hood poking INTO the FOV cone, so the shape
          itself shows which way it looks even before the cone registers. */}
      <g transform={`translate(${cx} ${cy}) rotate(${camera.dir_deg})`}>
        <circle r={s * 1.9} fill="rgba(37,99,235,0.14)" />
        <g stroke="#0a0a0a" strokeWidth={s * 0.09}>
          <rect
            x={-s * 1.15}
            y={-s * 0.8}
            width={s * 1.75}
            height={s * 1.6}
            rx={s * 0.45}
            fill="#3b82f6"
          />
          <path
            d={`M ${s * 0.55} ${-s * 0.42} L ${s * 1.35} ${-s * 0.62} L ${s * 1.35} ${s * 0.62} L ${s * 0.55} ${s * 0.42} Z`}
            fill="#2563eb"
          />
          <circle cx={s * 1.05} cy={0} r={s * 0.27} fill="#dbeafe" stroke="none" />
        </g>
      </g>
      {/* Friendly name over the raw mediamtx path when the agent supplied one. */}
      <title>{camera.name || camera.camera_id}</title>
    </g>
  );
}
