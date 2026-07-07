"use client";

import type { ZoneBreakdown } from "@/lib/types";

const TYPE_LABEL: Record<string, string> = {
  shelf: "Тавиур",
  checkout: "Касс",
  exit: "Орц/Гарц",
  entrance: "Орц",
};

const TYPE_COLOR: Record<string, string> = {
  shelf: "rgba(37,99,235,0.75)",
  checkout: "rgba(234,179,8,0.85)",
  exit: "rgba(220,38,38,0.8)",
  entrance: "rgba(34,197,94,0.8)",
};

/**
 * Zone activity table (docs/30 F4). Each drawn plan zone with the share of
 * footfall it captured, busiest first, with an inline share bar. Same-type
 * zones are numbered (Тавиур 1, Тавиур 2…) in the order returned.
 */
export function ZoneTable({ data }: { data: ZoneBreakdown }) {
  if (data.zones.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-(--color-muted-foreground)">
        Зон дотор хөдөлгөөн бүртгэгдээгүй байна.
      </div>
    );
  }

  // Number zones per type in display order.
  const seen: Record<string, number> = {};

  return (
    <div className="space-y-2">
      {data.zones.map((z) => {
        seen[z.type] = (seen[z.type] ?? 0) + 1;
        const sameType = data.zones.filter((x) => x.type === z.type).length;
        const label =
          (TYPE_LABEL[z.type] ?? z.type) +
          (sameType > 1 ? ` ${seen[z.type]}` : "");
        const pct = Math.round(z.share * 100);
        return (
          <div key={z.fixture_id} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm">{label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-(--color-muted)">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(2, pct)}%`,
                  background: TYPE_COLOR[z.type] ?? "var(--color-primary)",
                }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-sm tabular-nums">
              {pct}%
            </span>
            <span className="w-16 shrink-0 text-right text-xs text-(--color-muted-foreground) tabular-nums">
              {z.samples.toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
