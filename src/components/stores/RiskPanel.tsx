"use client";

import { useEffect, useMemo, useState } from "react";

import { behaviors as behaviorsApi } from "@/lib/api";
import type { RiskSummary } from "@/lib/types";

const DOW = ["Да", "Мя", "Лх", "Пү", "Ба", "Бя", "Ня"];
const LEVEL_MN: Record<string, string> = {
  MEDIUM: "Дунд",
  HIGH: "Өндөр",
  CRITICAL: "Ноцтой",
};

/** KPI value + delta vs the previous same-length window. Deltas here are the
 * rare metric where UP is BAD — so up wears the danger tone, down the ok one. */
function Delta({ now, prev }: { now: number; prev: number }) {
  if (prev <= 0) return null;
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return <span className="text-xs text-(--color-muted-foreground)">±0%</span>;
  const up = pct > 0;
  return (
    <span className={`text-xs font-medium ${up ? "text-(--color-danger)" : "text-(--color-success, #22C55E)"}`}>
      {up ? "↑" : "↓"} {Math.abs(pct)}%
    </span>
  );
}

/**
 * Risk analytics panel: totals with trend, a weekday×hour incident matrix
 * (visual twin of PeakMatrix, in the product risk-red), top firing behaviors
 * and cameras, and the latest episodes. Behavior keys are translated through
 * the same /behaviors config the rest of the app uses.
 */
export function RiskPanel({ data }: { data: RiskSummary }) {
  const [labels, setLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    behaviorsApi.get().then(
      (cfg) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const d of cfg.dimensions) map[d.key] = d.label_mn;
        setLabels(map);
      },
      () => {
        /* raw keys shown */
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const { grid, peak } = useMemo(() => {
    const m: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const c of data.cells) {
      const row = m[c.dow - 1];
      if (row && c.hour >= 0 && c.hour < 24) row[c.hour] = (row[c.hour] ?? 0) + c.count;
    }
    let best: { r: number; h: number; v: number } | null = null;
    m.forEach((rowVals, r) =>
      rowVals.forEach((v, h) => {
        if (v > 0 && (!best || v > best.v)) best = { r, h, v };
      }),
    );
    return { grid: m, peak: best as { r: number; h: number; v: number } | null };
  }, [data]);

  const max = data.max_cell || 1;

  if (data.total === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-(--color-muted-foreground)">
        Энэ хугацаанд эрсдэлтэй үйлдэл бүртгэгдээгүй. 👍
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="flex flex-wrap gap-6">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">{data.total}</span>
            <Delta now={data.total} prev={data.prev_total} />
          </div>
          <div className="text-xs text-(--color-muted-foreground)">
            эрсдэлтэй үйлдэл (өмнөх үе: {data.prev_total})
          </div>
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums text-(--color-danger)">
            {data.alerted}
          </div>
          <div className="text-xs text-(--color-muted-foreground)">сэрэмжлүүлэг болсон</div>
        </div>
      </div>

      {/* weekday × hour matrix — same anatomy as the visitor PeakMatrix so the
          two read side-by-side; risk wears the product red, visitors blue. */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div className="flex pl-7 text-[9px] text-(--color-muted-foreground)">
            {Array.from({ length: 24 }, (_, hh) => (
              <div key={hh} className="flex-1 text-center" style={{ minWidth: 12 }}>
                {hh % 3 === 0 ? `${String(hh).padStart(2, "0")}` : ""}
              </div>
            ))}
          </div>
          {grid.map((rowVals, r) => (
            <div key={r} className="flex items-center">
              <div className="w-7 shrink-0 text-[10px] text-(--color-muted-foreground)">
                {DOW[r]}
              </div>
              {rowVals.map((v, hh) => {
                const t = v / max;
                const isPeak = peak != null && peak.r === r && peak.h === hh;
                return (
                  <div
                    key={hh}
                    className="group relative flex-1 rounded-[2px]"
                    style={{
                      minWidth: 12,
                      height: 16,
                      margin: 1,
                      background:
                        v === 0 ? "var(--color-muted)" : `rgba(239,68,68,${0.15 + 0.85 * t})`,
                      boxShadow: isPeak ? "0 0 0 1.5px #fafafa" : undefined,
                    }}
                  >
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-(--color-background) px-2 py-1 text-xs shadow group-hover:block">
                      {DOW[r]} {String(hh).padStart(2, "0")}:00 · {v} үйлдэл
                      {isPeak ? " · оргил" : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div className="mt-1 text-right text-[10px] text-(--color-muted-foreground)">
            Цаг — дэлгүүрийн цагаар ({data.timezone})
          </div>
        </div>
      </div>

      {/* top behaviors + cameras */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-medium">Топ зан үйлүүд</div>
          {data.top_behaviors.slice(0, 5).map((b) => (
            <div key={b.key} className="flex items-center gap-2 py-0.5 text-sm">
              <div className="min-w-0 flex-1 truncate">{labels[b.key] ?? b.key}</div>
              <div className="h-1.5 w-24 overflow-hidden rounded bg-(--color-muted)">
                <div
                  className="h-full rounded bg-(--color-danger)"
                  style={{ width: `${Math.round(b.share * 100)}%` }}
                />
              </div>
              <div className="w-8 text-right text-xs tabular-nums text-(--color-muted-foreground)">
                {b.count}
              </div>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-1 text-xs font-medium">Камераар</div>
          {data.top_cameras.slice(0, 5).map((c) => (
            <div key={c.key} className="flex items-center gap-2 py-0.5 text-sm">
              <div className="min-w-0 flex-1 truncate">{c.key}</div>
              <div className="h-1.5 w-24 overflow-hidden rounded bg-(--color-muted)">
                <div
                  className="h-full rounded bg-(--color-danger)"
                  style={{ width: `${Math.round(c.share * 100)}%` }}
                />
              </div>
              <div className="w-8 text-right text-xs tabular-nums text-(--color-muted-foreground)">
                {c.count}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* latest episodes */}
      <div>
        <div className="mb-1 text-xs font-medium">Сүүлийн үйлдлүүд</div>
        <div className="space-y-1">
          {data.recent.slice(0, 8).map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span
                className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                  e.level === "CRITICAL" || e.level === "HIGH"
                    ? "bg-(--color-danger) text-white"
                    : "bg-(--color-muted) text-(--color-foreground)"
                }`}
              >
                {Math.round(e.peak_risk_pct)}%
              </span>
              <span className="min-w-0 flex-1 truncate">
                {(e.behaviors.length
                  ? e.behaviors.map((b) => labels[b] ?? b).join(", ")
                  : LEVEL_MN[e.level] ?? e.level) + (e.alerted ? " · 🔔" : "")}
              </span>
              <span className="whitespace-nowrap text-xs text-(--color-muted-foreground)">
                {e.camera_name} ·{" "}
                {new Date(e.ts).toLocaleString("mn-MN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
