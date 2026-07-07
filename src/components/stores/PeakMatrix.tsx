"use client";

import { useMemo } from "react";

import type { PeakMatrix as PeakMatrixData } from "@/lib/types";

// dow 1-7 = Mon-Sun (ISO). Rows top→bottom Даваа…Ням.
const DOW = ["Да", "Мя", "Лх", "Пү", "Ба", "Бя", "Ня"];

/**
 * Weekday × hour visitor matrix (docs/30). 7 rows (Mon-Sun) × 24 cols (hour),
 * each cell tinted by relative intensity — the classic "when is my store busy"
 * retail view. Pure DOM grid; primary-blue alpha ramp so it reads on the dark
 * theme. Hover shows the exact count.
 */
export function PeakMatrix({ data }: { data: PeakMatrixData }) {
  const grid = useMemo(() => {
    // [dowIndex 0-6][hour 0-23] → entries
    const m: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const c of data.cells) {
      const row = c.dow - 1; // 1-7 → 0-6
      const rowArr = m[row];
      if (rowArr && c.hour >= 0 && c.hour < 24) {
        rowArr[c.hour] = (rowArr[c.hour] ?? 0) + c.entries;
      }
    }
    return m;
  }, [data]);

  const max = data.max_entries || 1;

  if (data.cells.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-(--color-muted-foreground)">
        Хангалттай түүх хараахан алга. Хэдэн өдөр ажилласны дараа ачааллын
        хуваарь харагдана.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* hour axis */}
        <div className="flex pl-7 text-[9px] text-(--color-muted-foreground)">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="flex-1 text-center" style={{ minWidth: 12 }}>
              {h % 3 === 0 ? h : ""}
            </div>
          ))}
        </div>
        {grid.map((rowVals, r) => (
          <div key={r} className="flex items-center">
            <div className="w-7 shrink-0 text-[10px] text-(--color-muted-foreground)">
              {DOW[r]}
            </div>
            {rowVals.map((v, h) => {
              const t = v / max;
              return (
                <div
                  key={h}
                  className="group relative flex-1 rounded-[2px]"
                  style={{
                    minWidth: 12,
                    height: 16,
                    margin: 1,
                    background:
                      v === 0
                        ? "var(--color-muted)"
                        : `rgba(37,99,235,${0.15 + 0.85 * t})`,
                  }}
                >
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-(--color-background) px-2 py-1 text-xs shadow group-hover:block">
                    {DOW[r]} {String(h).padStart(2, "0")}:00 · {v}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
