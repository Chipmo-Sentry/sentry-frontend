"use client";

import {
  Button,
  Card,
  CardContent,
  ErrorState,
  Spinner,
} from "@chipmo-sentry/ui-kit";
import {
  ArrowLeft,
  CalendarClock,
  Clock,
  Flame,
  Layers,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
  StorePublic,
  TrafficSummary,
  ZoneBreakdown,
} from "@/lib/types";

const RANGES: { label: string; hours: number }[] = [
  { label: "24 цаг", hours: 24 },
  { label: "7 хоног", hours: 24 * 7 },
  { label: "30 хоног", hours: 24 * 30 },
];

/**
 * /stores/{id}/insights — retail analytics viewport (F1: plan render only).
 *
 * F2 нэмнэ: dwell heatmap (grid → viridis), F3: entry/exit count + KPI, F4:
 * traffic flow lines, F5: demographics. Layer switcher доор бэлэн бий,
 * гүйцэтгэлгүй давхаргууд идэвхигүй байдалтай харагдана.
 */
type LayerKey = "plan" | "dwell" | "flow" | "gender";

export default function StoreInsightsPage() {
  const params = useParams<{ id: string }>();
  const storeId = params.id;

  const [store, setStore] = useState<StorePublic | null>(null);
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    plan: true,
    dwell: true,
    flow: false,
    gender: false,
  });
  const [hours, setHours] = useState(24);
  const [heat, setHeat] = useState<FootfallGrid | null>(null);
  const [heatLoading, setHeatLoading] = useState(false);
  const [flow, setFlow] = useState<FlowSummary | null>(null);
  const [traffic, setTraffic] = useState<TrafficSummary | null>(null);
  const [zones, setZones] = useState<ZoneBreakdown | null>(null);
  const [peak, setPeak] = useState<PeakMatrixData | null>(null);

  async function load() {
    setError(null);
    try {
      const [s, p] = await Promise.all([
        stores.get(storeId),
        stores.floorPlan(storeId),
      ]);
      setStore(s);
      setPlan(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Алдаа");
    }
    // Peak matrix uses its own multi-week window, independent of the range
    // selector — best-effort, never blocks the page.
    try {
      setPeak(await stores.peak(storeId, 28));
    } catch {
      setPeak(null);
    }
  }

  const loadHeat = useCallback(async () => {
    setHeatLoading(true);
    try {
      setHeat(await stores.footfall(storeId, hours));
    } catch {
      // Heatmap is best-effort — a failure here shouldn't blank the page.
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // (Re)fetch the heatmap whenever the dwell layer is on or the range changes.
  useEffect(() => {
    if (layers.dwell) loadHeat();
  }, [layers.dwell, loadHeat]);

  // Flow lines fetch when the flow layer is on or the range changes.
  useEffect(() => {
    if (layers.flow) loadFlow();
  }, [layers.flow, loadFlow]);

  // Traffic KPIs + chart always track the selected range.
  useEffect(() => {
    loadTraffic();
  }, [loadTraffic]);

  if (error) {
    return (
      <div className="p-8">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }
  if (!store || !plan) {
    return (
      <div className="p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" asChild>
          <Link href="/stores">
            <ArrowLeft className="h-4 w-4" />
            Дэлгүүр
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{store.name} — Аналитик</h1>
          <p className="text-sm text-(--color-muted-foreground)">
            Дэлгүүрийн харилцагчийн урсгал, зогсох дулаан, хүн тоолох
          </p>
        </div>
        {/* Time-range selector — drives the heatmap window. */}
        <div className="ml-auto flex rounded-lg border border-(--color-border) p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.hours}
              onClick={() => setHours(r.hours)}
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
      </div>

      {/* KPI zurvas */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          icon={Users}
          label="Зочид"
          value={traffic ? traffic.total.toLocaleString() : "—"}
        />
        <KpiCard
          icon={TrendingUp}
          label="Хамгийн ачаалалтай цаг"
          value={
            traffic?.peak_hour
              ? `${fmtPeak(traffic.peak_hour)} · ${traffic.peak_entries}`
              : "—"
          }
        />
        <KpiCard
          icon={Clock}
          label="Дундаж зогсох"
          value={
            traffic?.avg_dwell_seconds != null
              ? fmtDwell(traffic.avg_dwell_seconds)
              : "—"
          }
        />
        <KpiCard
          icon={Flame}
          label="Идэвхийн оноо"
          value={heat ? heat.total_samples.toLocaleString() : "—"}
          hint="F2"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        {/* Floor plan + heatmap overlay */}
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

        {/* Right rail: layer switcher */}
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

            {/* Heatmap legend / empty note */}
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
                      : "Энэ хугацаанд хөдөлгөөний өгөгдөл цугараагүй байна. Камер идэвхтэй ажилласны дараа дулаан харагдана."}
                  </div>
                )}
              </div>
            ) : null}

            <div className="mt-4 rounded-md border border-(--color-border) bg-(--color-muted)/40 p-2 text-xs text-(--color-muted-foreground)">
              План зурагт{" "}
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
              камер бүртгэлтэй.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Hourly visitor traffic (F3) */}
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="h-4 w-4" />
              Цагийн зочид
            </div>
            {traffic ? (
              <TrafficChart summary={traffic} />
            ) : (
              <div className="flex h-32 items-center justify-center">
                <Spinner />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Zone breakdown (F4) */}
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Layers className="h-4 w-4" />
              Бүсийн идэвх
            </div>
            {zones ? (
              <ZoneTable data={zones} />
            ) : (
              <div className="flex h-24 items-center justify-center">
                <Spinner />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Peak-hour matrix — weekday × hour, last 4 weeks */}
      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="h-4 w-4" />
            Ачааллын хуваарь
            <span className="text-xs font-normal text-(--color-muted-foreground)">
              (сүүлийн 4 долоо хоног, гараг × цаг)
            </span>
          </div>
          {peak ? (
            <PeakMatrix data={peak} />
          ) : (
            <div className="flex h-32 items-center justify-center">
              <Spinner />
            </div>
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
          {hint ? (
            <span className="ml-auto rounded bg-(--color-muted) px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
              {hint}
            </span>
          ) : null}
        </div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
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
