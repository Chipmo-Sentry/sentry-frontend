"use client";

import { useMemo } from "react";

import type { ZoneFlowSummary } from "@/lib/types";

/**
 * Zone-to-zone visitor flow as a TABLE (owner request — arrows on the plan got
 * hard to read once transitions multiplied). Rows are directed transitions
 * sorted by volume, with a share bar in the product primary so it reads next
 * to the other analytics lists. The arrow layer stays available as a map
 * toggle; this table is the primary reading now.
 */
export function ZoneFlowTable({ flow }: { flow: ZoneFlowSummary }) {
  const rows = useMemo(() => {
    const byId = new Map(flow.nodes.map((n) => [n.id, n]));
    const total = flow.edges.reduce((s, e) => s + e.count, 0) || 1;
    return [...flow.edges]
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)
      .map((e) => ({
        from: byId.get(e.from_id)?.label ?? "?",
        to: byId.get(e.to_id)?.label ?? "?",
        count: e.count,
        share: e.count / total,
      }));
  }, [flow]);

  if (flow.nodes.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-(--color-muted-foreground)">
        Бүсийн урсгалд план дээр дор хаяж 2 тавиур/бүс зурсан байх хэрэгтэй.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-(--color-muted-foreground)">
        Хүмүүс хөдөлж эхэлмэгц бүс хоорондын шилжилт энд харагдана.
      </div>
    );
  }

  const max = rows[0]?.count || 1;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-(--color-border) text-left text-xs text-(--color-muted-foreground)">
            <th className="py-1.5 pr-2 font-medium">Хаанаас</th>
            <th className="py-1.5 pr-2 font-medium">Хаашаа</th>
            <th className="py-1.5 pr-2 text-right font-medium">Шилжилт</th>
            <th className="w-32 py-1.5 pl-3 font-medium">Эзлэх хувь</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-(--color-border) last:border-0">
              <td className="max-w-40 truncate py-1.5 pr-2">{r.from}</td>
              <td className="max-w-40 truncate py-1.5 pr-2">→ {r.to}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {r.count.toLocaleString()}
              </td>
              <td className="py-1.5 pl-3">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded bg-(--color-muted)">
                    <div
                      className="h-full rounded bg-(--color-primary)"
                      style={{ width: `${Math.max(3, Math.round((r.count / max) * 100))}%` }}
                    />
                  </div>
                  <span className="w-9 text-right text-xs tabular-nums text-(--color-muted-foreground)">
                    {Math.round(r.share * 100)}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
