"use client";

import type { ZoneBreakdown } from "@/lib/types";
import { zoneColor, zoneLabel } from "@/lib/zone-overlay";

/**
 * Zone activity table (docs/30 F4). Each drawn plan zone with the share of
 * footfall it captured, busiest first, with an inline share bar. Zones the
 * operator named in the agent editor show that name; unnamed same-type zones
 * are numbered (Тавиур 1, Тавиур 2…) in the order returned. Colours come from
 * the shared zone-style map so they match the plan viewport and /live.
 */
export function ZoneTable({
  data,
  names,
}: {
  data: ZoneBreakdown;
  /** Plan-wide zone names (fixture-names.ts) so this table says «Тавиур 2»
   * for the same shelf the plan drawing labels «Тавиур 2». Without it the
   * fallback numbers by activity rank, which changes with every window. */
  names?: Map<string, string>;
}) {
  if (data.zones.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-(--color-muted-foreground)">
        Зон дотор хөдөлгөөн бүртгэгдээгүй байна.
      </div>
    );
  }

  // Number UNNAMED zones per type in display order — named zones don't consume
  // a number, so «Тавиур 1» never goes missing because «Архины тавиур» came first.
  const seen: Record<string, number> = {};
  const unnamedOfType = (t: string) =>
    data.zones.filter((x) => x.type === t && !x.label).length;

  return (
    <div>
      {/* Column headers — the raw sample count was an unlabelled mystery number.
          The count column hides below sm: a 360px phone needs the share bar
          more than a second number. */}
      <div className="mb-1.5 flex items-center gap-3 text-[11px] text-(--color-muted-foreground)">
        <span className="w-20 shrink-0 sm:w-24">Бүс</span>
        <span className="flex-1" />
        <span className="w-10 shrink-0 text-right">Эзлэх</span>
        <span
          className="hidden w-16 shrink-0 text-right sm:block"
          title="Энэ бүсэд бүртгэгдсэн хөдөлгөөний цэг (харьцангуй үзүүлэлт)"
        >
          Бүртгэл
        </span>
      </div>
      <div className="space-y-2">
        {data.zones.map((z) => {
          if (!z.label) seen[z.type] = (seen[z.type] ?? 0) + 1;
          const label =
            names?.get(z.fixture_id) ||
            z.label ||
            zoneLabel(z.type) + (unnamedOfType(z.type) > 1 ? ` ${seen[z.type]}` : "");
          const pct = Math.round(z.share * 100);
          return (
            <div key={z.fixture_id} className="flex items-center gap-3">
              <span className="w-20 shrink-0 truncate text-sm sm:w-24" title={label}>
                {label}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-(--color-muted)">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, pct)}%`,
                    background: zoneColor(z.type) + "CC",
                  }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-sm tabular-nums">
                {pct}%
              </span>
              <span className="hidden w-16 shrink-0 text-right text-xs text-(--color-muted-foreground) tabular-nums sm:block">
                {z.samples.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
