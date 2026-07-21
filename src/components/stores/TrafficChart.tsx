"use client";

import { useMemo } from "react";

import type { TrafficSummary } from "@/lib/types";

/**
 * Hourly visitor bar chart (docs/30 F3). Buckets `summary.series` into one bar
 * per hour across the window; sparse hours (no traffic) render as empty slots so
 * the time axis stays continuous. Pure SVG/DOM — no chart lib (CSP blocks CDNs).
 *
 * `tz` (IANA, from the store) pins the time labels to STORE local time so the
 * chart agrees with the peak matrix even on a browser in another timezone.
 */
export function TrafficChart({
  summary,
  tz,
}: {
  summary: TrafficSummary;
  tz?: string;
}) {
  const bars = useMemo(() => {
    const from = new Date(summary.window_from).getTime();
    const to = new Date(summary.window_to).getTime();
    const hourMs = 3600_000;
    const slots = Math.max(1, Math.round((to - from) / hourMs));
    // Map each hour-slot index → entries.
    const byHour = new Map<number, number>();
    for (const p of summary.series) {
      const idx = Math.floor((new Date(p.hour).getTime() - from) / hourMs);
      byHour.set(idx, (byHour.get(idx) ?? 0) + p.entries);
    }
    const arr: { idx: number; entries: number; ts: number }[] = [];
    for (let i = 0; i < slots; i++) {
      arr.push({ idx: i, entries: byHour.get(i) ?? 0, ts: from + i * hourMs });
    }
    return arr;
  }, [summary]);

  const max = Math.max(1, ...bars.map((b) => b.entries));
  const dayWindow = bars.length <= 26; // ≈24h view → hour labels; else dates
  // Down-sample x-axis labels so a 30-day window doesn't crowd.
  const labelEvery = Math.ceil(bars.length / 12);
  // Y gridlines at max and its midpoint — enough to read magnitude off the
  // chart without hovering every bar.
  const mid = Math.round(max / 2);

  if (summary.total === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-(--color-muted-foreground)">
        Энэ хугацаанд зочдын өгөгдөл алга. Орц/гарцын бүс зурж, камер идэвхтэй
        ажилласны дараа тоологдоно.
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {/* Y axis: visitor counts for the gridlines. OUTSIDE the scroll pane so
          the magnitude stays readable while a long window is panned. */}
      <div className="flex h-32 w-8 shrink-0 flex-col justify-between text-right text-[10px] text-(--color-muted-foreground) tabular-nums">
        <span>{max.toLocaleString()}</span>
        <span>{mid.toLocaleString()}</span>
        <span>0</span>
      </div>
      {/* Bars keep a 2px minimum each, so a 7/30-day window is wider than a
          phone (or even a desktop card at 30d). Scroll INSIDE the chart —
          overflowing the card broke the whole page sideways on mobile. */}
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div style={{ minWidth: bars.length * 3 }}>
        <div className="relative flex h-32 items-end gap-px">
          {/* gridlines behind the bars */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute top-0 w-full border-t border-(--color-border)" />
            <div className="absolute top-1/2 w-full border-t border-dashed border-(--color-border)" />
            <div className="absolute bottom-0 w-full border-t border-(--color-border)" />
          </div>
          {bars.map((b) => (
            <div
              key={b.idx}
              className="group relative flex-1"
              style={{ minWidth: 2 }}
            >
              <div
                className="w-full rounded-t-sm bg-(--color-primary) transition-colors group-hover:bg-(--color-primary)/80"
                style={{ height: `${(b.entries / max) * 100}%` }}
              />
              {/* tooltip */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-(--color-background) px-2 py-1 text-xs shadow group-hover:block">
                {fmtHour(b.ts, tz)} · {b.entries} зочин
              </div>
            </div>
          ))}
        </div>
        {/* x-axis */}
        <div className="mt-1 flex gap-px text-[10px] text-(--color-muted-foreground)">
          {bars.map((b) => (
            <div
              key={b.idx}
              className="flex-1 text-center"
              style={{ minWidth: 2 }}
            >
              {b.idx % labelEvery === 0 ? fmtAxis(b.ts, tz, dayWindow) : ""}
            </div>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}

/** Intl throws RangeError on a garbage timeZone — fall back to the browser
 * zone instead of crashing the whole dashboard on one bad store row. */
function safeLocale(d: Date, opts: Intl.DateTimeFormatOptions, tz?: string): string {
  try {
    return d.toLocaleString("mn-MN", { ...opts, timeZone: tz });
  } catch {
    return d.toLocaleString("mn-MN", opts);
  }
}

function fmtHour(ts: number, tz?: string): string {
  return safeLocale(
    new Date(ts),
    { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" },
    tz,
  );
}

function fmtAxis(ts: number, tz: string | undefined, dayWindow: boolean): string {
  const d = new Date(ts);
  // 24h view: "14:00" reads better than "14 05"; longer views: "07-08" (date).
  return dayWindow
    ? safeLocale(d, { hour: "2-digit", minute: "2-digit" }, tz)
    : safeLocale(d, { month: "2-digit", day: "2-digit" }, tz);
}
