"use client";

import { ArrowDownToDot, ArrowUpFromDot, MoveRight } from "lucide-react";
import { useMemo } from "react";

import type { ZoneFlowSummary } from "@/lib/types";
import { zoneColor } from "@/lib/zone-overlay";

/**
 * Zone-to-zone visitor flow as a TABLE (owner request — arrows on the plan got
 * hard to read once transitions multiplied). Rows are directed NET transitions
 * sorted by volume; each row also shows how one-way the corridor is (the net
 * winner vs. the gross return flow). Zone chips wear the shared zone colours so
 * the table reads against the plan and the activity list.
 */
export function ZoneFlowTable({ flow }: { flow: ZoneFlowSummary }) {
  const { rows, attractor, source } = useMemo(() => {
    const byId = new Map(flow.nodes.map((n) => [n.id, n]));
    const total = flow.edges.reduce((s, e) => s + e.count, 0) || 1;
    const rows = [...flow.edges]
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)
      .map((e) => {
        const back = e.back_count ?? 0;
        // count is the NET winner; the winning direction's gross is count+back.
        const gross = e.count + back * 2;
        return {
          from: byId.get(e.from_id),
          to: byId.get(e.to_id),
          count: e.count,
          back,
          // Share of all movement on this corridor going the winning way.
          oneWay: gross > 0 ? (e.count + back) / gross : 1,
          share: e.count / total,
        };
      });
    // Top attractor / top source across the whole window (backend sums ALL
    // edges into the node totals, not just the visible top rows).
    const attractor = [...flow.nodes].sort(
      (a, b) => (b.in_total ?? 0) - (a.in_total ?? 0),
    )[0];
    const source = [...flow.nodes].sort(
      (a, b) => (b.out_total ?? 0) - (a.out_total ?? 0),
    )[0];
    return {
      rows,
      attractor: attractor && (attractor.in_total ?? 0) > 0 ? attractor : null,
      source: source && (source.out_total ?? 0) > 0 ? source : null,
    };
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
    <div>
      {/* Headline chips — the two numbers an owner acts on: what pulls
          visitors in, and where the traffic pours out of. */}
      {attractor || source ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {attractor ? (
            <SummaryChip
              icon={ArrowDownToDot}
              label="Хамгийн их татдаг"
              zone={attractor.label}
              color={zoneColor(attractor.type)}
              value={`${(attractor.in_total ?? 0).toLocaleString()} орсон`}
            />
          ) : null}
          {source ? (
            <SummaryChip
              icon={ArrowUpFromDot}
              label="Хамгийн их гаргадаг"
              zone={source.label}
              color={zoneColor(source.type)}
              value={`${(source.out_total ?? 0).toLocaleString()} гарсан`}
            />
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--color-border) text-left text-xs text-(--color-muted-foreground)">
              <th className="w-6 py-1.5 pr-1 font-medium">#</th>
              <th className="py-1.5 pr-2 font-medium">Чиглэл</th>
              <th className="py-1.5 pr-2 text-right font-medium">
                <span title="Цэвэр шилжилт — эсрэг чиглэлийг хассан давамгай урсгал">
                  Шилжилт
                </span>
              </th>
              <th className="hidden py-1.5 pr-2 text-right font-medium sm:table-cell">
                <span title="Хэдэн хувь нь зөвхөн энэ чиглэлд урссан бэ (100% = буцах хөдөлгөөнгүй)">
                  Нэг чигт
                </span>
              </th>
              <th className="w-32 py-1.5 pl-3 font-medium">Эзлэх хувь</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className="border-b border-(--color-border) transition-colors last:border-0 hover:bg-(--color-muted)/40"
              >
                <td className="py-2 pr-1 text-xs text-(--color-muted-foreground) tabular-nums">
                  {i + 1}
                </td>
                <td className="py-2 pr-2">
                  <span className="flex items-center gap-1.5">
                    <ZoneChip label={r.from?.label ?? "?"} color={zoneColor(r.from?.type ?? "")} />
                    <MoveRight className="h-3.5 w-3.5 shrink-0 text-(--color-muted-foreground)" />
                    <ZoneChip label={r.to?.label ?? "?"} color={zoneColor(r.to?.type ?? "")} />
                  </span>
                </td>
                <td className="py-2 pr-2 text-right font-medium tabular-nums">
                  {r.count.toLocaleString()}
                </td>
                <td
                  className="hidden py-2 pr-2 text-right text-xs text-(--color-muted-foreground) tabular-nums sm:table-cell"
                  title={
                    r.back > 0
                      ? `Эсрэг чиглэлд ${r.back.toLocaleString()} буцсан`
                      : "Буцах хөдөлгөөн бүртгэгдээгүй"
                  }
                >
                  {Math.round(r.oneWay * 100)}%
                </td>
                <td className="py-2 pl-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded bg-(--color-muted)">
                      <div
                        className="h-full rounded bg-(--color-primary)"
                        style={{
                          width: `${Math.max(3, Math.round((r.count / max) * 100))}%`,
                        }}
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
    </div>
  );
}

/** Zone name with its plan colour dot — visually links the row to the map. */
function ZoneChip({ label, color }: { label: string; color: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <span className="max-w-32 truncate sm:max-w-44" title={label}>
        {label}
      </span>
    </span>
  );
}

function SummaryChip({
  icon: Icon,
  label,
  zone,
  color,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  zone: string;
  color: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-(--color-border) bg-(--color-muted)/30 px-3 py-1.5 text-xs">
      <Icon className="h-3.5 w-3.5 shrink-0 text-(--color-primary)" />
      <span className="text-(--color-muted-foreground)">{label}:</span>
      <span className="flex items-center gap-1.5 font-medium">
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: color }}
        />
        {zone}
      </span>
      <span className="text-(--color-muted-foreground)">· {value}</span>
    </div>
  );
}
