"use client";

import { useMemo } from "react";

import type { TrafficSummary } from "@/lib/types";

/**
 * Hourly visitor bar chart (docs/30 F3). Buckets `summary.series` into one bar
 * per hour across the window; sparse hours (no traffic) render as empty slots so
 * the time axis stays continuous. Pure SVG — no chart lib (CSP blocks CDNs).
 */
export function TrafficChart({ summary }: { summary: TrafficSummary }) {
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
  // Down-sample x-axis labels so a 30-day window doesn't crowd.
  const labelEvery = Math.ceil(bars.length / 12);

  if (summary.total === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-(--color-muted-foreground)">
        Энэ хугацаанд зочдын өгөгдөл алга. Орц/гарцын бүс зурж, камер идэвхтэй
        ажилласны дараа тоологдоно.
      </div>
    );
  }

  return (
    <div>
      <div className="flex h-32 items-end gap-px">
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
              {fmtHour(b.ts)} · {b.entries}
            </div>
          </div>
        ))}
      </div>
      {/* x-axis */}
      <div className="mt-1 flex gap-px text-[10px] text-(--color-muted-foreground)">
        {bars.map((b) => (
          <div key={b.idx} className="flex-1 text-center" style={{ minWidth: 2 }}>
            {b.idx % labelEvery === 0 ? fmtAxis(b.ts) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtHour(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("mn-MN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtAxis(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("mn-MN", { hour: "2-digit", day: "2-digit" });
}
