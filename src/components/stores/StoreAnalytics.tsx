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

import { FloorPlanViewport } from "@/components/stores/FloorPlanViewport";
import { FlowLayer } from "@/components/stores/FlowLayer";
import { HeatmapLayer } from "@/components/stores/HeatmapLayer";
import { PeakMatrix } from "@/components/stores/PeakMatrix";
import { TrafficChart } from "@/components/stores/TrafficChart";
import { ZoneTable } from "@/components/stores/ZoneTable";
import { stores } from "@/lib/api";
import type {
  FloorPlan,
  FlowSummary,
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

type LayerKey = "plan" | "dwell" | "flow" | "gender";

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
    flow: false,
    gender: false,
  });
  const [heat, setHeat] = useState<FootfallGrid | null>(null);
  const [heatLoading, setHeatLoading] = useState(false);
  const [flow, setFlow] = useState<FlowSummary | null>(null);
  const [traffic, setTraffic] = useState<TrafficSummary | null>(null);
  const [zones, setZones] = useState<ZoneBreakdown | null>(null);
  const [peak, setPeak] = useState<PeakMatrixData | null>(null);

  const loadPlan = useCallback(async () => {
    setError(null);
    try {
      setPlan(await stores.floorPlan(storeId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Алдаа");
    }
    try {
      setPeak(await stores.peak(storeId, 28));
    } catch {
      setPeak(null);
    }
  }, [storeId]);

  const loadHeat = useCallback(async () => {
    setHeatLoading(true);
    try {
      setHeat(await stores.footfall(storeId, hours));
    } catch {
      setHeat(null);
    } finally {
      setHeatLoading(false);
    }
  }, [storeId, hours]);

  const loadFlow = useCallback(async () => {
    try {
      setFlow(await stores.flow(storeId, hours));
    } catch {
      setFlow(null);
    }
  }, [storeId, hours]);

  const loadTraffic = useCallback(async () => {
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
    }
  }, [storeId, hours]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);
  useEffect(() => {
    if (layers.dwell) loadHeat();
  }, [layers.dwell, loadHeat]);
  useEffect(() => {
    if (layers.flow) loadFlow();
  }, [layers.flow, loadFlow]);
  useEffect(() => {
    loadTraffic();
  }, [loadTraffic]);

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

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          icon={Users}
          label="Зочид"
          hint="Хугацаанд орж ирсэн хүн"
          value={traffic ? traffic.total.toLocaleString() : "—"}
        />
        <KpiCard
          icon={TrendingUp}
          label="Ачаалалтай цаг"
          hint="Хамгийн их зочидтой"
          value={
            traffic?.peak_hour
              ? `${fmtPeak(traffic.peak_hour)} · ${traffic.peak_entries}`
              : "—"
          }
        />
        <KpiCard
          icon={Clock}
          label="Дундаж зогсолт"
          hint="Нэг зочны хугацаа"
          value={
            traffic?.avg_dwell_seconds != null
              ? fmtDwell(traffic.avg_dwell_seconds)
              : "—"
          }
        />
        <KpiCard
          icon={Footprints}
          label="Хөдөлгөөн"
          hint="Илрүүлсэн хэмжээ"
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
            overlay={
              <>
                {layers.dwell && heat ? <HeatmapLayer grid={heat} /> : null}
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
                label="Зогсох дулаан"
                checked={layers.dwell}
                hint={heatLoading ? "…" : undefined}
                onChange={(v) => setLayers((s) => ({ ...s, dwell: v }))}
              />
              <LayerRow
                label="Хөдөлгөөний урсгал"
                checked={layers.flow}
                onChange={(v) => setLayers((s) => ({ ...s, flow: v }))}
              />
              <LayerRow
                label="Хүйс/нас"
                checked={layers.gender}
                disabled
                hint="Тун удахгүй"
                onChange={(v) => setLayers((s) => ({ ...s, gender: v }))}
              />

              {layers.dwell ? (
                <div className="mt-3 rounded-md border border-(--color-border) p-2">
                  {heat && heat.cells.length > 0 ? (
                    <>
                      <div className="mb-1 text-xs text-(--color-muted-foreground)">
                        Зогсох эрчим
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
                      {heatLoading
                        ? "Ачаалж байна…"
                        : "Энэ хугацаанд хөдөлгөөний өгөгдөл алга."}
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
              Өдрийн турш зочдын урсгал
            </SectionHead>
            {traffic && !noData ? (
              <TrafficChart summary={traffic} />
            ) : (
              <EmptyBox
                loading={!traffic}
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
              <EmptyBox loading={!zones} text="Бүсийн идэвх хараахан алга." />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Peak-hour matrix */}
      <Card>
        <CardContent className="p-4">
          <SectionHead icon={CalendarClock} title="Ачааллын хуваарь" inline>
            Гараг × цаг — сүүлийн 4 долоо хоног
          </SectionHead>
          {peak ? (
            <PeakMatrix data={peak} />
          ) : (
            <EmptyBox loading text="" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function fmtPeak(iso: string): string {
  return new Date(iso).toLocaleString("mn-MN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDwell(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}с`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}м ${rem}с` : `${m}м`;
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

function EmptyBox({ loading, text }: { loading?: boolean; text: string }) {
  return (
    <div className="flex h-32 items-center justify-center px-4 text-center text-xs text-(--color-muted-foreground)">
      {loading ? <Spinner /> : text}
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
