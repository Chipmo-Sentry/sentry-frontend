"use client";

import { useMemo, useState } from "react";

import { calibratedCoverage } from "@/lib/camera-coverage";
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
export function FloorPlanViewport({ plan, overlay, dimPlan = false }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  // Frame the DRAWN store, not the whole canvas: a ~10×10 m store on a 20-200 m
  // canvas rendered as a speck with monstrous canvas-proportioned marks. The
  // viewBox crops to the content extent and every mark (camera dot, FOV cone,
  // strokes, grid) sizes off that extent, so marks stay visually consistent
  // whatever canvas the store was drawn on.
  const ext = useMemo(() => planExtent(plan), [plan]);
  const base = Math.min(ext.w, ext.h) || 100;
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
        viewBox={`${ext.x} ${ext.y} ${ext.w} ${ext.h}`}
        className="block h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Дэлгүүрийн план зураг"
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
          <CameraMarker key={c.camera_id + i} camera={c} base={base} walls={plan.walls} />
        ))}

        {overlay}
      </svg>

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
  walls,
}: {
  camera: {
    camera_id: string;
    name?: string | null;
    pos: [number, number];
    dir_deg: number;
    homography?: number[][] | null;
  };
  /** Smaller plan dimension — all marks scale off it (see FloorPlanViewport). */
  base: number;
  walls: { points: number[][] }[];
}) {
  const [cx, cy] = camera.pos;
  // Calibrated camera → its REAL wall-clipped ground footprint (same math as
  // the agent editor's coverage overlay); uncalibrated → the cosmetic wedge.
  const coverage = calibratedCoverage(camera, walls);
  // 60° FOV wedge + camera dot, both sized as a fraction of the plan so they
  // read the same on any store's plan (not fixed plan-units).
  const R = base * 0.12;
  const dot = base * 0.02;
  const half = 30; // half-angle deg
  const a1 = ((camera.dir_deg - half) * Math.PI) / 180;
  const a2 = ((camera.dir_deg + half) * Math.PI) / 180;
  const p1 = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)];
  const p2 = [cx + R * Math.cos(a2), cy + R * Math.sin(a2)];
  const fovPath = `M ${cx} ${cy} L ${p1[0]} ${p1[1]} A ${R} ${R} 0 0 1 ${p2[0]} ${p2[1]} Z`;
  return (
    <g>
      {coverage ? (
        <polygon
          points={coverage.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="rgba(37,99,235,0.16)"
          stroke="rgba(37,99,235,0.5)"
          strokeWidth={base * 0.003}
          strokeLinejoin="round"
        />
      ) : (
        <path
          d={fovPath}
          fill="rgba(37,99,235,0.18)"
          stroke="rgba(37,99,235,0.45)"
          strokeWidth={base * 0.003}
        />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={dot}
        fill="#2563eb"
        stroke="#0a0a0a"
        strokeWidth={dot * 0.3}
      />
      {/* Friendly name over the raw mediamtx path when the agent supplied one. */}
      <title>{camera.name || camera.camera_id}</title>
    </g>
  );
}
