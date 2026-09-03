"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

import { FloorPlanViewport } from "@/components/stores/FloorPlanViewport";
import { fixtureName, fixtureNames } from "@/lib/fixture-names";
import { planExtent } from "@/lib/plan-extent";
import type { FloorPlan, PathsSummary, WalkedPath } from "@/lib/types";
import { zoneColor } from "@/lib/zone-overlay";

/**
 * Per-visitor routes (owner request 09-03): the tracker follows each person
 * from the door, so the flow section should show WHERE each visitor went —
 * «Орц → Тавиур 2 → Касс → Орц/Гарц» — not only the aggregate zone flow.
 *
 * Left: the most recent visits (newest first) with their zone sequence.
 * Right: the selected visit drawn on a small plan — the walked line with
 * numbered stops, a green «entered» dot and a red «left» dot.
 *
 * The zone sequence is derived here from the walked polyline: a point counts
 * as a stop when it lies inside a fixture polygon or within ZONE_TOL metres of
 * its edge (people stand BESIDE a shelf, never inside it). Consecutive repeats
 * collapse, walkway stretches are skipped. Paths are anonymous — no track id
 * is stored — so visits are numbered by recency within the window.
 */

/** Metres around a fixture polygon that still count as «at this zone». */
const ZONE_TOL = 0.7;
const PAGE = 25;

export type RouteStop = {
  key: string;
  name: string;
  type: string;
  /** Index into path.points where the visitor first reached this zone. */
  at: number;
};

type Poly = { key: string; name: string; type: string; pts: [number, number][] };

function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (!a || !b) continue;
    const [xi, yi] = a;
    const [xj, yj] = b;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(px: number, py: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function nearPolygon(x: number, y: number, poly: [number, number][], tol: number): boolean {
  if (pointInPolygon(x, y, poly)) return true;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (a && b && distToSegment(x, y, a, b) <= tol) return true;
  }
  return false;
}

/** Zone sequence of one walked path (plan units = metres). */
export function routeStops(path: WalkedPath, polys: Poly[], size: [number, number]): RouteStop[] {
  const [w, h] = size;
  const stops: RouteStop[] = [];
  let lastKey: string | null = null;
  path.points.forEach((pt, i) => {
    const x = (pt[0] ?? 0) * w;
    const y = (pt[1] ?? 0) * h;
    // Smallest polygon wins when zones overlap (a shelf inside a bigger area).
    const hit = polys.find((p) => nearPolygon(x, y, p.pts, ZONE_TOL));
    const key = hit?.key ?? null;
    if (key && key !== lastKey) {
      stops.push({ key, name: hit!.name, type: hit!.type, at: i });
    }
    if (key) lastKey = key;
  });
  return stops;
}

/** Backend visitor number «20260903-012»; rows older than the backfill fall
 * back to their position in the window. */
function visitorNo(p: WalkedPath, idx: number): string {
  return p.visitor_id || `#${idx + 1}`;
}

function fmtDuration(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s} сек`;
  const m = Math.floor(s / 60);
  return `${m} мин ${String(s % 60).padStart(2, "0")} сек`;
}

const GENDER_LABEL: Record<string, string> = { male: "Эр", female: "Эм" };
const AGE_LABEL: Record<string, string> = {
  child: "хүүхэд",
  youth: "залуу",
  adult: "насанд хүрсэн",
  senior: "ахмад",
};

export function VisitorRoutes({
  plan,
  data,
  tz,
}: {
  plan: FloorPlan;
  data: PathsSummary;
  tz?: string | null;
}) {
  const [selected, setSelected] = useState(0);
  const [shown, setShown] = useState(PAGE);

  const polys = useMemo<Poly[]>(() => {
    const names = fixtureNames(plan);
    const list: Poly[] = [];
    plan.fixtures.forEach((f, i) => {
      if (f.type === "furniture" || f.points.length < 3) return;
      list.push({
        key: f.id ?? `z${i}`,
        name: fixtureName(names, f, i),
        type: f.type,
        pts: f.points as [number, number][],
      });
    });
    // Smaller polygons first so a shelf inside a larger zone wins the hit test.
    return list.sort((a, b) => polyArea(a.pts) - polyArea(b.pts));
  }, [plan]);

  const size = plan.size as [number, number];
  const visits = useMemo(
    () =>
      data.paths.map((p, i) => ({
        idx: i,
        path: p,
        stops: routeStops(p, polys, size),
      })),
    [data.paths, polys, size],
  );

  const timeFmt = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("mn-MN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: tz || undefined,
      });
    } catch {
      return new Intl.DateTimeFormat("mn-MN", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
  }, [tz]);
  const dayFmt = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("mn-MN", { month: "2-digit", day: "2-digit", timeZone: tz || undefined });
    } catch {
      return new Intl.DateTimeFormat("mn-MN", { month: "2-digit", day: "2-digit" });
    }
  }, [tz]);

  if (visits.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-(--color-muted-foreground)">
        Энэ хугацаанд бүртгэгдсэн зочны зам алга — дата хуримтлагдаж байна.
      </div>
    );
  }
  const current = visits[Math.min(selected, visits.length - 1)] ?? visits[0]!;
  const withStops = visits.filter((v) => v.stops.length > 0).length;
  const avgSec = visits.reduce((s, v) => s + v.path.duration_sec, 0) / visits.length;
  const today = dayFmt.format(new Date());

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div>
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--color-muted-foreground)">
          <span>
            Зочин: <b className="text-(--color-foreground)">{visits.length}</b>
          </span>
          <span>
            Бүсэд хүрсэн: <b className="text-(--color-foreground)">{withStops}</b>
          </span>
          <span>
            Дундаж хугацаа: <b className="text-(--color-foreground)">{fmtDuration(avgSec)}</b>
          </span>
        </div>
        <div className="max-h-[420px] overflow-y-auto pr-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-(--color-card) text-left text-[11px] text-(--color-muted-foreground)">
              <tr className="border-b border-(--color-border)">
                <th className="py-1.5 pr-2 font-medium" title="Зочны дугаар: он-сар-өдөр + тухайн өдрийн дараалал">
                  ID
                </th>
                <th className="w-16 py-1.5 pr-2 font-medium">Цаг</th>
                <th className="hidden w-24 py-1.5 pr-2 font-medium sm:table-cell">Хугацаа</th>
                <th className="py-1.5 font-medium">Маршрут</th>
              </tr>
            </thead>
            <tbody>
              {visits.slice(0, shown).map((v) => {
                const active = v.idx === current.idx;
                const day = dayFmt.format(new Date(v.path.started_at));
                const demo = [
                  v.path.gender ? GENDER_LABEL[v.path.gender] : null,
                  v.path.age_band ? AGE_LABEL[v.path.age_band] : null,
                ]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <tr
                    key={v.idx}
                    onClick={() => setSelected(v.idx)}
                    className={`cursor-pointer border-b border-(--color-border) last:border-0 ${
                      active ? "bg-(--color-primary)/12" : "hover:bg-(--color-muted)/40"
                    }`}
                  >
                    <td className="py-2 pr-2 text-xs text-(--color-muted-foreground) tabular-nums whitespace-nowrap">
                      {visitorNo(v.path, v.idx)}
                    </td>
                    <td className="py-2 pr-2 tabular-nums" title={demo || undefined}>
                      <div>{timeFmt.format(new Date(v.path.started_at))}</div>
                      {day !== today ? (
                        <div className="text-[10px] text-(--color-muted-foreground)">{day}</div>
                      ) : null}
                    </td>
                    <td className="hidden py-2 pr-2 text-xs text-(--color-muted-foreground) tabular-nums sm:table-cell">
                      {fmtDuration(v.path.duration_sec)}
                      {demo ? <div className="text-[10px]">{demo}</div> : null}
                    </td>
                    <td className="py-2">
                      <RouteChips stops={v.stops} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {shown < visits.length ? (
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="mt-2 flex items-center gap-1 text-xs text-(--color-muted-foreground) hover:text-(--color-foreground)"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Дараагийн {Math.min(PAGE, visits.length - shown)} зочин
          </button>
        ) : null}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs text-(--color-muted-foreground)">
          <span>
            <b className="text-(--color-foreground)">{visitorNo(current.path, current.idx)}</b> ·{" "}
            {timeFmt.format(new Date(current.path.started_at))} · {fmtDuration(current.path.duration_sec)}
          </span>
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-[#22c55e]" /> орсон
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-[#ef4444]" /> гарсан
            </span>
          </span>
        </div>
        <FloorPlanViewport
          plan={plan}
          dimPlan
          compact
          overlay={<RouteOverlay plan={plan} path={current.path} stops={current.stops} />}
        />
      </div>
    </div>
  );
}

function polyArea(pts: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

/** «Орц/Гарц → Тавиур 2 → Касс» as coloured chips; long routes fold the middle. */
function RouteChips({ stops }: { stops: RouteStop[] }) {
  if (stops.length === 0) {
    return <span className="text-xs text-(--color-muted-foreground)">Зөвхөн зорчсон (бүсэд зогсоогүй)</span>;
  }
  const MAX = 6;
  const shown = stops.length > MAX ? [...stops.slice(0, MAX - 1)] : stops;
  const hidden = stops.length - shown.length;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((s, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 ? <span className="text-(--color-muted-foreground)">→</span> : null}
          <span
            className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]"
            style={{ borderColor: zoneColor(s.type) + "80", background: zoneColor(s.type) + "1F" }}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: zoneColor(s.type) }} />
            {s.name}
          </span>
        </span>
      ))}
      {hidden > 0 ? (
        <span className="text-[11px] text-(--color-muted-foreground)">→ … +{hidden}</span>
      ) : null}
    </span>
  );
}

/** The selected visit on the plan: walked line + numbered stops + in/out dots. */
function RouteOverlay({
  plan,
  path,
  stops,
}: {
  plan: FloorPlan;
  path: WalkedPath;
  stops: RouteStop[];
}) {
  const [w, h] = plan.size;
  const ext = planExtent(plan);
  const base = Math.min(ext.w, ext.h);
  const pts = path.points.map((p) => [(p[0] ?? 0) * w, (p[1] ?? 0) * h] as [number, number]);
  if (pts.length < 2) return null;
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
  const sw = base * 0.012;
  const r = base * 0.022;
  const font = base * 0.028;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  return (
    <g style={{ pointerEvents: "none" }}>
      <defs>
        <marker
          id="route-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="4"
          markerHeight="4"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#fbbf24" />
        </marker>
      </defs>
      {/* Dark under-stroke so the route reads on any fixture colour. */}
      <path d={d} fill="none" stroke="rgba(10,15,30,0.7)" strokeWidth={sw * 2.2} strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={d}
        fill="none"
        stroke="#fbbf24"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd="url(#route-arrow)"
      />
      {stops.map((s, i) => {
        const p = pts[s.at] ?? first;
        return (
          <g key={i}>
            <circle cx={p[0]} cy={p[1]} r={r} fill="#fbbf24" stroke="rgba(10,15,30,0.85)" strokeWidth={r * 0.25} />
            <text
              x={p[0]}
              y={p[1]}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={font}
              fontWeight={700}
              fill="#0a0f1e"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {i + 1}
            </text>
          </g>
        );
      })}
      <circle cx={first[0]} cy={first[1]} r={r * 0.8} fill="#22c55e" stroke="rgba(10,15,30,0.85)" strokeWidth={r * 0.25} />
      <circle cx={last[0]} cy={last[1]} r={r * 0.8} fill="#ef4444" stroke="rgba(10,15,30,0.85)" strokeWidth={r * 0.25} />
    </g>
  );
}
