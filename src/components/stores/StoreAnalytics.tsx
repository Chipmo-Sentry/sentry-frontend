"use client";

import { Card, CardContent, ErrorState, Spinner } from "@chipmo-sentry/ui-kit";
import {
  Box,
  Activity,
  ArrowRightLeft,
  CalendarClock,
  ShieldAlert,
  Clock,
  Footprints,
  Layers,
  MapPinned,
  TrendingUp,
  Users,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// three.js stays out of the main bundle — fetched only when 3D is opened.
const PlanViewport3D = dynamic(
  () => import("@/components/stores/PlanViewport3D"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[70vh] items-center justify-center rounded-lg border border-(--color-border)">
        <Spinner />
      </div>
    ),
  },
);

import { DemographicsPanel } from "@/components/stores/DemographicsPanel";
import { FloorPlanViewport } from "@/components/stores/FloorPlanViewport";
import { PathsLayer } from "@/components/stores/PathsLayer";
import { RiskPanel } from "@/components/stores/RiskPanel";
import { ZoneFlowTable } from "@/components/stores/ZoneFlowTable";
import { HeatmapLayer } from "@/components/stores/HeatmapLayer";
import { PeakMatrix } from "@/components/stores/PeakMatrix";
import { TrafficChart } from "@/components/stores/TrafficChart";
import { ZoneTable } from "@/components/stores/ZoneTable";
import { stores, type StoreSystemHealth } from "@/lib/api";
import { fixtureNames } from "@/lib/fixture-names";
import { zoneLabel } from "@/lib/zone-overlay";
import type {
  DemographicsSummary,
  FloorPlan,
  PathsSummary,
  FootfallGrid,
  PeakMatrix as PeakMatrixData,
  RiskSummary,
  TrafficSummary,
  ZoneBreakdown,
  ZoneFlowSummary,
} from "@/lib/types";

export const ANALYTICS_RANGES: { label: string; hours: number }[] = [
  { label: "24 цаг", hours: 24 },
  { label: "7 хоног", hours: 24 * 7 },
  { label: "30 хоног", hours: 24 * 30 },
];

/** Time-range segmented control shared by both analytics routes. Full-width
 * equal-split on phones (easy thumb targets), natural width from sm: up. */
export function RangeTabs({
  hours,
  onChange,
}: {
  hours: number;
  onChange: (h: number) => void;
}) {
  return (
    <div className="flex w-full rounded-lg border border-(--color-border) p-0.5 sm:w-auto">
      {ANALYTICS_RANGES.map((r) => (
        <button
          key={r.hours}
          onClick={() => onChange(r.hours)}
          className={`flex-1 rounded-md px-3 py-1 text-sm whitespace-nowrap transition-colors sm:flex-initial ${
            hours === r.hours
              ? "bg-(--color-primary) text-(--color-primary-foreground)"
              : "text-(--color-muted-foreground) hover:text-(--color-foreground)"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

type LayerKey = "labels" | "dwell" | "paths";

/** In-page sections for the sticky jump nav — the dashboard is 5+ screens
 * tall, so the owner needs one-tap access to «Эрсдэл» instead of a scroll hunt. */
const SECTIONS = [
  { id: "a-kpi", label: "Тойм" },
  { id: "a-map", label: "План" },
  { id: "a-flow", label: "Урсгал" },
  { id: "a-risk", label: "Эрсдэл" },
  { id: "a-peak", label: "Хуваарь" },
  { id: "a-health", label: "Чанар" },
] as const;

function SectionNav() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  // The observer marks a section active while it crosses the upper third of
  // the viewport — matches where the eye lands after a jump.
  const ratios = useRef<Record<string, number>>({});
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          ratios.current[e.target.id] = e.isIntersecting ? e.intersectionRatio : 0;
        let best: string | null = null;
        let bestRatio = 0;
        for (const s of SECTIONS) {
          const r = ratios.current[s.id] ?? 0;
          if (r > bestRatio) {
            bestRatio = r;
            best = s.id;
          }
        }
        if (best) setActive(best);
      },
      { rootMargin: "-64px 0px -40% 0px", threshold: [0, 0.15, 0.4, 0.8] },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, []);

  return (
    <nav
      aria-label="Хэсгүүд"
      className="sticky top-0 z-20 -mx-1 flex gap-1 overflow-x-auto rounded-lg border border-(--color-border) bg-(--color-background)/90 p-1 backdrop-blur"
    >
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          onClick={() =>
            document
              .getElementById(s.id)
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          className={`flex-1 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors sm:flex-initial ${
            active === s.id
              ? "bg-(--color-primary) text-(--color-primary-foreground)"
              : "text-(--color-muted-foreground) hover:text-(--color-foreground)"
          }`}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}

/** KPI trend vs the previous same-length window. Visitors/dwell going UP is
 * good news (unlike RiskPanel's Delta where up is bad). */
function TrendBadge({ now, prev }: { now: number; prev: number | null | undefined }) {
  if (prev == null || prev <= 0) return null;
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct === 0)
    return <span className="text-xs text-(--color-muted-foreground)">±0%</span>;
  const up = pct > 0;
  return (
    <span
      className={`text-xs font-medium ${
        up ? "text-(--color-success,#22C55E)" : "text-(--color-danger)"
      }`}
      title="Өмнөх ижил урттай үетэй харьцуулав"
    >
      {up ? "↑" : "↓"} {Math.abs(pct)}%
    </span>
  );
}

/**
 * The retail-analytics dashboard for ONE store, self-contained by `storeId` +
 * `hours` so it can be dropped into the sidebar `/insights` page (with a store
 * picker) OR the per-store `/stores/{id}/insights` route. Every section degrades
 * to a friendly empty-state until the cameras have produced footfall data, so an
 * un-populated store reads as "waiting for data", not "broken".
 */
export function StoreAnalytics({
  storeId,
  hours,
}: {
  storeId: string;
  hours: number;
}) {
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [threeD, setThreeD] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Flow arrows/toggle removed entirely (owner): the flow reads as the
  // ZoneFlowTable card below the map now.
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    labels: true,
    dwell: true,
    paths: false,
  });
  // One naming for the plan labels AND the zone tables (see fixture-names.ts).
  const names = useMemo(() => (plan ? fixtureNames(plan) : undefined), [plan]);
  const [risk, setRisk] = useState<RiskSummary | null>(null);
  const [health, setHealth] = useState<StoreSystemHealth | null>(null);
  const [heat, setHeat] = useState<FootfallGrid | null>(null);
  const [heatLoading, setHeatLoading] = useState(false);
  const [flow, setFlow] = useState<ZoneFlowSummary | null>(null);
  const [paths, setPaths] = useState<PathsSummary | null>(null);
  const [pathAge, setPathAge] = useState<string | null>(null);
  const [pathGender, setPathGender] = useState<string | null>(null);
  // Path-layer extras (owner backlog): hide short pass-throughs, colour by hour.
  const [pathMinDur, setPathMinDur] = useState<number | null>(null);
  const [pathColorHour, setPathColorHour] = useState(false);
  const [traffic, setTraffic] = useState<TrafficSummary | null>(null);
  const [zones, setZones] = useState<ZoneBreakdown | null>(null);
  const [peak, setPeak] = useState<PeakMatrixData | null>(null);
  const [demo, setDemo] = useState<DemographicsSummary | null>(null);
  // Which section loads FAILED (vs. merely empty) — a backend 500 must not be
  // indistinguishable from "no data yet", or a broken deploy reads as a quiet
  // store. Keyed per loader; each flag clears when its (re)load starts so a
  // retry shows the loading state, not the stale error.
  const [failed, setFailed] = useState<{
    heat?: boolean;
    traffic?: boolean;
    peak?: boolean;
    flow?: boolean;
    demo?: boolean;
  }>({});

  const loadPlan = useCallback(async () => {
    setError(null);
    try {
      setPlan(await stores.floorPlan(storeId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Алдаа");
    }
  }, [storeId]);

  // Separate from loadPlan: the peak retry must not re-run the plan fetch (a
  // plan hiccup would otherwise blank the whole dashboard into ErrorState).
  const loadPeak = useCallback(async () => {
    setFailed((f) => ({ ...f, peak: false }));
    try {
      setPeak(await stores.peak(storeId, 28));
    } catch {
      setPeak(null);
      setFailed((f) => ({ ...f, peak: true }));
    }
  }, [storeId]);

  const loadHeat = useCallback(async () => {
    setHeatLoading(true);
    setFailed((f) => ({ ...f, heat: false }));
    try {
      setHeat(await stores.footfall(storeId, hours));
    } catch {
      setHeat(null);
      setFailed((f) => ({ ...f, heat: true }));
    } finally {
      setHeatLoading(false);
    }
  }, [storeId, hours]);

  const loadFlow = useCallback(async () => {
    setFailed((f) => ({ ...f, flow: false }));
    try {
      // Zone-level flow (owner choice 07-21): the backend collapses grid
      // transitions onto the operator-drawn fixtures → named arrows.
      setFlow(await stores.zoneFlow(storeId, hours));
    } catch {
      setFlow(null);
      setFailed((f) => ({ ...f, flow: true }));
    }
  }, [storeId, hours]);

  const loadTraffic = useCallback(async () => {
    setFailed((f) => ({ ...f, traffic: false }));
    try {
      const [t, z] = await Promise.all([
        stores.traffic(storeId, hours),
        stores.zones(storeId, hours),
      ]);
      setTraffic(t);
      setZones(z);
    } catch {
      setTraffic(null);
      setZones(null);
      setFailed((f) => ({ ...f, traffic: true }));
    }
  }, [storeId, hours]);

  const loadDemo = useCallback(async () => {
    setFailed((f) => ({ ...f, demo: false }));
    try {
      setDemo(await stores.demographics(storeId, hours));
    } catch {
      setDemo(null);
      setFailed((f) => ({ ...f, demo: true }));
    }
  }, [storeId, hours]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);
  useEffect(() => {
    loadPeak();
  }, [loadPeak]);
  useEffect(() => {
    if (layers.dwell) loadHeat();
  }, [layers.dwell, loadHeat]);
  const loadPaths = useCallback(async () => {
    try {
      setPaths(await stores.paths(storeId, hours));
    } catch {
      setPaths(null);
    }
  }, [storeId, hours]);

  // Risk analytics load with the window — the panel below the map always shows
  // them.
  const loadRisk = useCallback(async () => {
    try {
      setRisk(await stores.risk(storeId, hours));
    } catch {
      setRisk(null);
    }
  }, [storeId, hours]);
  useEffect(() => {
    loadRisk();
  }, [loadRisk]);

  // System quality: camera availability, detection precision/FP, response time.
  const loadHealth = useCallback(async () => {
    try {
      setHealth(await stores.systemHealth(storeId, hours));
    } catch {
      setHealth(null);
    }
  }, [storeId, hours]);
  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  // Flow loads with the window (not on toggle) — the trails are a headline
  // feature, so the data is ready the moment the layer is switched on.
  useEffect(() => {
    loadFlow();
  }, [loadFlow]);
  useEffect(() => {
    if (layers.paths) loadPaths();
  }, [layers.paths, loadPaths]);
  useEffect(() => {
    loadTraffic();
  }, [loadTraffic]);
  useEffect(() => {
    loadDemo();
  }, [loadDemo]);

  if (error) {
    return <ErrorState message={error} onRetry={loadPlan} />;
  }
  if (!plan) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // Loaded traffic with zero visitors ⇒ cameras haven't produced footfall yet.
  const noData = traffic != null && traffic.total === 0;
  // Store-local timezone (server computes the peak matrix in it). Charts + KPI
  // times use the SAME zone so "ачаалалтай цаг 14:00" never disagrees with the
  // matrix on a browser set to another timezone.
  const tz = peak?.timezone;

  // Busiest zone — actionable for the owner, unlike the raw sample counter it
  // replaced. The breakdown arrives busiest-first from the backend.
  const topZone = zones?.zones[0];
  const topZoneName = topZone ? topZone.label || zoneLabel(topZone.type) : null;

  return (
    <div className="space-y-4">
      <SectionNav />

      {/* KPI row */}
      <div id="a-kpi" className="grid scroll-mt-14 grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          icon={Users}
          label="Зочид"
          hint="Орц/гарцаар орсон давхардалгүй зочин (re-ID) · ажилтан хасагдсан"
          value={traffic ? traffic.total.toLocaleString() : "—"}
          delta={
            traffic ? (
              <TrendBadge now={traffic.total} prev={traffic.prev_total} />
            ) : null
          }
        />
        <KpiCard
          icon={TrendingUp}
          label="Ачаалалтай цаг"
          hint="Хамгийн олон зочинтой цаг"
          value={
            traffic?.peak_hour
              ? `${fmtPeak(traffic.peak_hour, tz)} · ${traffic.peak_entries} зочин`
              : "—"
          }
        />
        <KpiCard
          icon={Clock}
          label="Дундаж зогсолт"
          hint="Нэг зочны дэлгүүрт байсан хугацаа"
          value={
            traffic?.avg_dwell_seconds != null
              ? fmtDwell(traffic.avg_dwell_seconds)
              : "—"
          }
          delta={
            traffic?.avg_dwell_seconds != null ? (
              <TrendBadge
                now={traffic.avg_dwell_seconds}
                prev={traffic.prev_avg_dwell_seconds}
              />
            ) : null
          }
        />
        <KpiCard
          icon={Footprints}
          label="Идэвхтэй бүс"
          hint={
            topZone
              ? `Зочдын ${Math.round(topZone.share * 100)}% энд зогссон`
              : "Хамгийн их зогсдог тавиур/булан"
          }
          value={topZoneName ?? "—"}
        />
      </div>

      {/* Empty-state banner — data hasn't accumulated yet. */}
      {noData ? (
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <div className="mt-0.5 rounded-md bg-(--color-primary)/10 p-2 text-(--color-primary)">
              <Footprints className="h-5 w-5" />
            </div>
            <div className="text-sm">
              <div className="font-medium">Өгөгдөл хараахан цуграагүй байна</div>
              <p className="mt-0.5 text-(--color-muted-foreground)">
                Камер идэвхтэй ажиллаж, зочид дэлгүүрээр орж эхэлсний дараа
                зочдын урсгал, зогсох дулаан, ачааллын хуваарь энд аяндаа
                харагдана. Доорх дэлгүүрийн план зураг одооноос бэлэн байна.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Store map (floor plan) + layer switcher */}
      <div id="a-map" className="scroll-mt-14">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <SectionHead icon={MapPinned} title="Дэлгүүрийн план зураг">
            Тавиур, орц/гарц, камерын байрлал ба зогсох дулааны давхарга
          </SectionHead>
          {/* 2D ⇄ 3D: the 3D view extrudes walls/fixtures to their real
              heights; analytics overlays stay a 2D feature for now. */}
          <div className="flex rounded-lg border border-(--color-border) p-0.5">
            {([false, true] as const).map((v) => (
              <button
                key={String(v)}
                onClick={() => setThreeD(v)}
                className={`flex items-center gap-1 rounded-md px-3 py-1 text-sm transition-colors ${
                  threeD === v
                    ? "bg-(--color-primary) text-(--color-primary-foreground)"
                    : "text-(--color-muted-foreground) hover:text-(--color-foreground)"
                }`}
              >
                {v ? <Box className="h-3.5 w-3.5" /> : null}
                {v ? "3D" : "2D"}
              </button>
            ))}
          </div>
        </div>
        {threeD ? <PlanViewport3D plan={plan} /> : null}
        <div className={threeD ? "hidden" : "grid gap-4 md:grid-cols-[1fr_260px]"}>
          <FloorPlanViewport
            plan={plan}
            showLabels={layers.labels}
            dimPlan={layers.paths && !!paths}
            overlay={
              <>
                {layers.dwell && heat ? <HeatmapLayer grid={heat} /> : null}
                {layers.paths && paths ? (
                  <PathsLayer
                    plan={plan}
                    data={paths}
                    ageBand={pathAge}
                    gender={pathGender}
                    minDurationSec={pathMinDur}
                    colorByHour={pathColorHour}
                  />
                ) : null}
              </>
            }
          />
          <Card>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Layers className="h-4 w-4" />
                Давхарга
              </div>
              <LayerRow
                label="Бүсийн нэр (тавиур, орц/гарц)"
                checked={layers.labels}
                onChange={(v) => setLayers((s) => ({ ...s, labels: v }))}
              />
              <LayerRow
                label="Хэрэглэгчдийн төвлөрөл"
                checked={layers.dwell}
                hint={heatLoading ? "…" : undefined}
                onChange={(v) => setLayers((s) => ({ ...s, dwell: v }))}
              />
              <LayerRow
                label="Хэрэглэгчийн зам (тус бүр)"
                checked={layers.paths}
                hint={layers.paths && paths && paths.paths.length === 0 ? "дата хуримтлагдаж байна" : undefined}
                onChange={(v) => setLayers((s) => ({ ...s, paths: v }))}
              />
              {layers.paths ? (
                <div className="mt-1 mb-2 rounded-md border border-(--color-border) p-2 text-[10px] text-(--color-muted-foreground)">
                  <div className="mb-2 grid grid-cols-4 gap-1">
                    {(
                      [
                        [null, "Бүгд", "163,163,163"],
                        ["male", "Эр", "59,130,246"],
                        ["female", "Эм", "239,68,68"],
                        ["unknown", "Бусад", "74,222,128"],
                      ] as [string | null, string, string][]
                    ).map(([val, lbl, rgb]) => {
                      const active = pathGender === val;
                      return (
                        <button
                          key={lbl}
                          type="button"
                          onClick={() => setPathGender(val)}
                          className="flex items-center justify-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors"
                          style={
                            active
                              ? {
                                  borderColor: `rgb(${rgb})`,
                                  background: `rgba(${rgb}, 0.18)`,
                                  color: "#fafafa",
                                }
                              : {
                                  borderColor: "var(--color-border)",
                                  color: "var(--color-muted-foreground)",
                                }
                          }
                        >
                          <span
                            className="inline-block h-2 w-2 shrink-0 rounded-full"
                            style={{
                              background: `rgb(${rgb})`,
                              opacity: active ? 1 : 0.55,
                            }}
                          />
                          {lbl}
                        </button>
                      );
                    })}
                  </div>
                  <select
                    value={pathAge ?? ""}
                    onChange={(e) => setPathAge(e.target.value || null)}
                    className="w-full rounded-md border border-(--color-border) bg-(--color-background) px-2 py-1.5 text-[11px]"
                  >
                    <option value="">Бүх нас</option>
                    <option value="child">Хүүхэд</option>
                    <option value="youth">Залуу</option>
                    <option value="adult">Насанд хүрсэн</option>
                    <option value="senior">Ахмад</option>
                  </select>
                  <select
                    value={pathMinDur ?? ""}
                    onChange={(e) =>
                      setPathMinDur(e.target.value ? Number(e.target.value) : null)
                    }
                    className="mt-1 w-full rounded-md border border-(--color-border) bg-(--color-background) px-2 py-1.5 text-[11px]"
                  >
                    <option value="">Бүх зочид</option>
                    <option value="120">2+ минут зогссон</option>
                    <option value="300">5+ минут зогссон</option>
                    <option value="600">10+ минут зогссон</option>
                  </select>
                  <label className="mt-2 flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pathColorHour}
                      onChange={(e) => setPathColorHour(e.target.checked)}
                      className="h-3 w-3"
                    />
                    Цагаар өнгөөр ялгах
                  </label>
                  {pathColorHour ? (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span>Өглөө</span>
                      <span
                        aria-hidden
                        className="h-1.5 flex-1 rounded-full"
                        style={{
                          background:
                            "linear-gradient(90deg, hsl(200 85% 60%), hsl(133 85% 60%), hsl(67 85% 60%), hsl(0 85% 60%))",
                        }}
                      />
                      <span>Орой</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {layers.dwell ? (
                <div className="mt-3 rounded-md border border-(--color-border) p-2">
                  {heat && heat.cells.length > 0 ? (
                    <>
                      <div className="mb-1 text-xs text-(--color-muted-foreground)">
                        Төвлөрлийн эрчим
                      </div>
                      <div
                        className="h-2 w-full rounded"
                        style={{
                          background:
                            "linear-gradient(90deg, rgb(68,1,84), rgb(59,82,139), rgb(33,145,140), rgb(94,201,98), rgb(253,231,37))",
                        }}
                      />
                      <div className="mt-1 flex justify-between text-[10px] text-(--color-muted-foreground)">
                        <span>Бага</span>
                        <span>Их</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-(--color-muted-foreground)">
                      {heatLoading ? (
                        "Ачаалж байна…"
                      ) : failed.heat ? (
                        <button
                          onClick={loadHeat}
                          className="text-(--color-primary) underline"
                        >
                          Ачаалж чадсангүй — дахин оролдох
                        </button>
                      ) : (
                        "Энэ хугацаанд хөдөлгөөний өгөгдөл алга."
                      )}
                    </div>
                  )}
                </div>
              ) : null}

              <div className="mt-4 rounded-md border border-(--color-border) bg-(--color-muted)/40 p-2 text-xs text-(--color-muted-foreground)">
                Планд{" "}
                <span className="text-(--color-foreground)">
                  {plan.walls.length}
                </span>{" "}
                хана,{" "}
                <span className="text-(--color-foreground)">
                  {plan.fixtures.length}
                </span>{" "}
                бүс,{" "}
                <span className="text-(--color-foreground)">
                  {plan.cameras.length}
                </span>{" "}
                камер.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Hourly traffic + zone breakdown */}
      <div id="a-flow" className="grid scroll-mt-14 gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="p-4">
            <SectionHead icon={TrendingUp} title="Цагийн зочид" inline>
              Өдрийн турш зочдын урсгал{tz ? ` — ${tz} цагаар` : ""}
            </SectionHead>
            {traffic && !noData ? (
              <TrafficChart summary={traffic} tz={tz} />
            ) : (
              <EmptyBox
                loading={!traffic && !failed.traffic}
                error={failed.traffic}
                onRetry={loadTraffic}
                text="Зочид бүртгэгдсэний дараа цагийн график харагдана."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <SectionHead icon={Layers} title="Бүсийн идэвх" inline>
              Аль тавиур/буланд хамгийн их зогсдог
            </SectionHead>
            {zones && !noData ? (
              <ZoneTable data={zones} names={names} />
            ) : (
              <EmptyBox
                loading={!zones && !failed.traffic}
                error={failed.traffic}
                onRetry={loadTraffic}
                text="Бүсийн идэвх хараахан алга."
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Zone flow as a table — the primary flow reading (owner request);
          the arrow layer on the map stays as an opt-in toggle. */}
      <Card>
        <CardContent className="p-4">
          <SectionHead icon={ArrowRightLeft} title="Хэрэглэгчийн урсгал" inline>
            Бүс хоорондын шилжилтүүд — ихээс бага руу
          </SectionHead>
          {flow ? (
            <ZoneFlowTable flow={flow} names={names} />
          ) : (
            <EmptyBox
              loading={!failed.flow}
              error={!!failed.flow}
              onRetry={loadFlow}
              text=""
            />
          )}
        </CardContent>
      </Card>

      {/* Risk analytics — the theft-detection half of the product, on the
          analytics page: totals+trend, when incidents happen, what fires. */}
      <Card id="a-risk" className="scroll-mt-14">
        <CardContent className="p-4">
          <SectionHead icon={ShieldAlert} title="Эрсдэлийн аналитик" inline>
            Сэжигтэй үйлдлүүд — хэзээ, хаана, юу
          </SectionHead>
          {risk ? (
            <RiskPanel data={risk} />
          ) : (
            <EmptyBox loading error={false} onRetry={loadRisk} text="" />
          )}
        </CardContent>
      </Card>

      {/* Peak-hour matrix + demographics */}
      <div id="a-peak" className="grid scroll-mt-14 gap-4 lg:grid-cols-[1fr_400px]">
        <Card>
          <CardContent className="p-4">
            <SectionHead icon={CalendarClock} title="Ачааллын хуваарь" inline>
              Гараг × цаг — сүүлийн 4 долоо хоног
            </SectionHead>
            {peak ? (
              <PeakMatrix data={peak} />
            ) : (
              <EmptyBox
                loading={!failed.peak}
                error={failed.peak}
                onRetry={loadPeak}
                text=""
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <SectionHead icon={Users} title="Хүйс, насны бүтэц" inline>
              Ангилагдсан зочдын хуваарилалт
            </SectionHead>
            {demo ? (
              <DemographicsPanel data={demo} />
            ) : (
              <EmptyBox
                loading={!failed.demo}
                error={failed.demo}
                onRetry={loadDemo}
                text=""
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* System quality — the operational half: is the store actually being
          watched (camera availability), how accurate are the alerts, and how
          fast does staff respond. */}
      <Card id="a-health" className="scroll-mt-14">
        <CardContent className="p-4">
          <SectionHead icon={Activity} title="Системийн чанар" inline>
            Камерын бэлэн байдал, илрүүлэлтийн нарийвчлал, хариу өгөх хугацаа
          </SectionHead>
          {health ? (
            <SystemHealthPanel data={health} />
          ) : (
            <EmptyBox loading error={false} onRetry={loadHealth} text="" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Camera availability + detection precision + alert response time. */
function SystemHealthPanel({ data }: { data: StoreSystemHealth }) {
  const { cameras: c, quality: q, response_time: rt } = data;
  const fmtMin = (v: number | null) =>
    v === null ? "—" : v < 1 ? `${Math.round(v * 60)} сек` : `${v} мин`;
  const availTone =
    c.availability_pct == null
      ? ""
      : c.availability_pct >= 95
        ? "text-(--color-success,#22C55E)"
        : c.availability_pct >= 80
          ? "text-amber-500"
          : "text-(--color-danger)";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HealthTile
          label="Камерын бэлэн байдал"
          value={c.availability_pct == null ? "—" : `${c.availability_pct}%`}
          hint={`${c.online}/${c.online + c.offline} онлайн`}
          tone={availTone}
        />
        <HealthTile
          label="Илрүүлэлтийн нарийвчлал"
          value={q.precision == null ? "—" : `${Math.round(q.precision * 100)}%`}
          hint={q.labeled ? `✓${q.tp} / ✗${q.fp}` : "шошго алга"}
        />
        <HealthTile
          label="Худал дохионы хувь"
          value={q.fp_rate == null ? "—" : `${Math.round(q.fp_rate * 100)}%`}
          hint={q.labeled ? `${q.labeled} шошготой` : "шошго алга"}
        />
        <HealthTile
          label="Хариу өгөх хугацаа"
          value={fmtMin(rt.median_min)}
          hint={rt.count ? `медиан · ${rt.count} дохио` : "дата алга"}
        />
      </div>

      {c.offline_list.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-sm font-medium">Офлайн камерууд</div>
          {c.offline_list.map((cam, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-md bg-(--color-muted) px-3 py-1.5 text-sm"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-(--color-danger)" />
              <span className="min-w-0 flex-1 truncate">{cam.camera}</span>
              <span className="shrink-0 text-xs text-(--color-muted-foreground)">
                {cam.reason}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-(--color-muted-foreground)">
        «Бэлэн байдал» нь одоогийн агшны байдал. Нарийвчлал/худал дохио нь
        ажилтны «зөв/худал» тэмдэглэгээнээс, хариу өгөх хугацаа нь дохио гарснаас
        анх тэмдэглэх хүртэлх зөрүү.
      </p>
    </div>
  );
}

function HealthTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-(--color-border) p-3">
      <div className="text-xs text-(--color-muted-foreground)">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? ""}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-(--color-muted-foreground)">{hint}</div>
    </div>
  );
}

/** Store-local clock time; falls back to the browser zone until the peak
 * matrix (which carries the store tz) has loaded — or when the stored tz
 * string is garbage (Intl throws RangeError on unknown zones). */
function fmtPeak(iso: string, tz?: string): string {
  try {
    return new Date(iso).toLocaleString("mn-MN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    });
  } catch {
    return new Date(iso).toLocaleString("mn-MN", { hour: "2-digit", minute: "2-digit" });
  }
}

/** Duration in «мин»/«с» — NOT a bare «м», which reads as метр on a page that
 * also shows floor-plan dimensions in metres. */
function fmtDwell(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} с`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m} мин ${rem} с` : `${m} мин`;
}

function SectionHead({
  icon: Icon,
  title,
  children,
  inline,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children?: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <div className={inline ? "mb-3" : "mb-2"}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-(--color-primary)" />
        {title}
      </div>
      {children ? (
        <p className="mt-0.5 pl-6 text-xs text-(--color-muted-foreground)">
          {children}
        </p>
      ) : null}
    </div>
  );
}

function EmptyBox({
  loading,
  error,
  onRetry,
  text,
}: {
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  text: string;
}) {
  return (
    <div className="flex h-32 items-center justify-center px-4 text-center text-xs text-(--color-muted-foreground)">
      {loading ? (
        <Spinner />
      ) : error ? (
        <button onClick={onRetry} className="text-(--color-primary) underline">
          Ачаалж чадсангүй — дахин оролдох
        </button>
      ) : (
        text
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  delta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  delta?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center gap-2 text-xs text-(--color-muted-foreground)">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </div>
        {/* Long values ("14:00 · 25 зочин") must wrap, not blow the 2-col
            phone grid open — smaller size + break-words below sm. */}
        <div className="mt-1 flex items-baseline gap-2 text-lg font-semibold break-words sm:text-2xl">
          <span className="min-w-0">{value}</span>
          {delta}
        </div>
        {hint ? (
          <div className="mt-0.5 text-[11px] text-(--color-muted-foreground)">
            {hint}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LayerRow({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label
      className={`mb-1 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm ${
        disabled
          ? "cursor-not-allowed text-(--color-muted-foreground)"
          : "cursor-pointer hover:bg-(--color-muted)"
      }`}
    >
      <span className="flex items-center gap-2">
        <input
          type="checkbox"
          className="accent-(--color-primary)"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        {label}
      </span>
      {hint ? (
        <span className="rounded bg-(--color-muted) px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
