"use client";

import type { DemographicSlice, DemographicsSummary } from "@/lib/types";

/**
 * Gender/age structure of classified visitors (docs/30 F5). Data comes from
 * optional per-track classifier attributes on the live stream — a store whose
 * AI node runs no demographics model gets `total=0` and the waiting state.
 * Buckets are a closed vocabulary normalized server-side.
 */

const GENDER_META: Record<string, { label: string; color: string }> = {
  male: { label: "Эрэгтэй", color: "#3B82F6" },
  female: { label: "Эмэгтэй", color: "#EC4899" },
  unknown: { label: "Тодорхойгүй", color: "#71717A" },
};

const AGE_META: Record<string, { label: string; color: string }> = {
  child: { label: "Хүүхэд", color: "#22D3EE" },
  youth: { label: "Залуу", color: "#4F8EF7" },
  adult: { label: "Насанд хүрэгч", color: "#2563EB" },
  senior: { label: "Ахмад настан", color: "#A78BFA" },
  unknown: { label: "Тодорхойгүй", color: "#71717A" },
};

export function DemographicsPanel({ data }: { data: DemographicsSummary }) {
  if (data.total === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-1 px-4 text-center text-xs text-(--color-muted-foreground)">
        <span className="text-sm">Нас/хүйсний өгөгдөл хараахан алга.</span>
        <span>
          AI node дээр нас/хүйс таних загвар идэвхжсэний дараа зочдын бүтэц энд
          аяндаа харагдана.
        </span>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <SliceBars title="Хүйс" slices={data.gender} meta={GENDER_META} total={data.total} />
      <SliceBars title="Нас" slices={data.age} meta={AGE_META} total={data.total} />
      <div className="text-[11px] text-(--color-muted-foreground)">
        Нийт ангилагдсан зочин: {data.total.toLocaleString()}
      </div>
    </div>
  );
}

function SliceBars({
  title,
  slices,
  meta,
  total,
}: {
  title: string;
  slices: DemographicSlice[];
  meta: Record<string, { label: string; color: string }>;
  total: number;
}) {
  if (slices.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-(--color-muted-foreground)">
        {title}
      </div>
      <div className="space-y-1.5">
        {slices.map((s) => {
          const m = meta[s.key] ?? { label: s.key, color: "#71717A" };
          const pct = Math.round(s.share * 100);
          return (
            <div key={s.key} className="flex items-center gap-3">
              <span className="w-22 shrink-0 truncate text-sm sm:w-28">{m.label}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-(--color-muted)">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, pct)}%`,
                    background: m.color + "CC",
                  }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-sm tabular-nums">
                {pct}%
              </span>
              {/* Raw count hides on phones — the % + bar carry the story. */}
              <span
                className="hidden w-14 shrink-0 text-right text-xs text-(--color-muted-foreground) tabular-nums sm:block"
                title={`${s.count.toLocaleString()} хүн / нийт ${total.toLocaleString()}`}
              >
                {s.count.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
