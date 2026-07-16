"use client";

import { Card, CardContent, ErrorState, Spinner } from "@chipmo-sentry/ui-kit";
import {
  CalendarClock,
  Clock,
  Footprints,
  Layers,
  MapPinned,
  TrendingUp,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { DemographicsPanel } from "@/components/stores/DemographicsPanel";
import { FloorPlanViewport } from "@/components/stores/FloorPlanViewport";
import { FlowLayer } from "@/components/stores/FlowLayer";
import { PathsLayer } from "@/components/stores/PathsLayer";
import { HeatmapLayer } from "@/components/stores/HeatmapLayer";
import { PeakMatrix } from "@/components/stores/PeakMatrix";
import { TrafficChart } from "@/components/stores/TrafficChart";
import { ZoneTable } from "@/components/stores/ZoneTable";
import { stores } from "@/lib/api";
import type {
  DemographicsSummary,
  FloorPlan,
  FlowSummary,
  PathsSummary,
  FootfallGrid,
  PeakMatrix as PeakMatrixData,
  TrafficSummary,
  ZoneBreakdown,
} from "@/lib/types";

export const ANALYTICS_RANGES: { label: string; hours: number }[] = [
  { label: "24 цаг", hours: 24 },
  { label: "7 хоног", hours: 24 * 7 },
  { label: "30 хоног", hours: 24 * 30 },
];

/** Time-range segmented control shared by both analytics routes. */
export function RangeTabs({
  hours,
  onChange,
}: {
  hours: number;
  onChange: (h: number) => void;
}) {
  return (
    <div className="flex rounded-lg border border-(--color-border) p-0.5">
      {ANALYTICS_RANGES.map((r) => (
        <button
          key={r.hours}
          onClick={() => onChange(r.hours)}
          className={`rounded-md px-3 py-1 text-sm transition-colors ${
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

type LayerKey = "plan" | "dwell" | "flow" | "paths";

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
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    plan: true,
    dwell: true,
    flow: true,
    paths: false,
  });
  const [heat, setHeat] = useState<FootfallGrid | null>(null);
  const [heatLoading, setHeatLoading] = useState(false);
  const [flow, setFlow] = useState<FlowSummary | null>(null);
  const [paths, setPaths] = useState<PathsSummary | null>(null);
  const [pathAge, setPathAge] = useState<string | null>(null);
  const [pathGender, setPathGender] = useState<string | null>(null);
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
      setFlow(await stores.flow(storeId, hours));
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

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          icon={Users}
          label="Зочид"
          hint="Орц/гарцаар орсон давхардалгүй зочин (re-ID)"
          value={traffic ? traffic.total.toLocaleString() : "—"}
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
        />
        <KpiCard
          icon={Footprints}
          label="Идэвх"
          hint="Бүртгэгдсэн байршлын цэг — харьцангуй индекс"
          value={heat ? heat.total_samples.toLocaleString() : "—"}
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
      <div>
        <SectionHead icon={MapPinned} title="Дэлгүүрийн план зураг">
          Тавиур, орц/гарц, камерын байрлал ба зогсох дулааны давхарга
        </SectionHead>
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <FloorPlanViewport
            plan={plan}
            dimPlan={layers.paths && !!paths}
            overlay={
              <>
                {layers.dwell && heat ? <HeatmapLayer grid={heat} /> : null}
                {layers.paths && paths ? (
                  <PathsLayer plan={plan} data={paths} ageBand={pathAge} gender={pathGender} />
                ) : null}
                {layers.flow && flow ? (
                  <FlowLayer plan={plan} flow={flow} />
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
                label="План зураг"
                checked={layers.plan}
                onChange={(v) => setLayers((s) => ({ ...s, plan: v }))}
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
                </div>
              ) : null}
              <LayerRow
                label="Хэрэглэгчийн урсгал"
                checked={layers.flow}
                hint={failed.flow ? "алдаа" : undefined}
                onChange={(v) => setLayers((s) => ({ ...s, flow: v }))}
              />

              {layers.flow ? (
                <div className="mt-2 rounded-md border border-(--color-border) p-2 text-[10px] text-(--color-muted-foreground)">
                  {failed.flow ? (
                    <button
                      onClick={loadFlow}
                      className="text-(--color-primary) underline"
                    >
                      Урсгал ачаалж чадсангүй — дахин оролдох
                    </button>
                  ) : flow && flow.edges.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <svg width="46" height="10" aria-hidden>
                        <line
                          x1="2"
                          y1="5"
                          x2="38"
                          y2="5"
                          stroke="rgba(96,165,250,0.9)"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                        <path d="M 38 1 L 45 5 L 38 9 z" fill="rgba(96,165,250,0.9)" />
                      </svg>
                      <span>
                        Явсан мөр: зузаан = олон хүн, сум = чиглэл (
                        {flow.edges.length} шилжилт)
                      </span>
                    </div>
                  ) : (
                    "Явсан мөр: хүмүүс хөдөлж эхэлмэгц урсгалын шугамууд харагдана."
                  )}
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
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
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
              <ZoneTable data={zones} />
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

      {/* Peak-hour matrix + demographics */}
      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
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
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-(--color-muted-foreground)">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
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
