"use client";

export type LiveKpiBarProps = {
  online: number;
  total: number;
  todayAlerts: number;
  /** Mean VLM inference latency over recent alerts (ms), or null if none. */
  avgLatencyMs: number | null;
  aiHealthy: boolean;
};

type Tone = "ok" | "warn" | "bad" | "plain";

const TONE_CLASS: Record<Tone, string> = {
  ok: "text-green-400",
  warn: "text-amber-400",
  bad: "text-red-400",
  plain: "text-(--color-foreground)",
};

/**
 * Smart-console KPI strip — the at-a-glance health line above the spotlight:
 * cameras online, today's alert count, mean response, and AI status.
 */
export function LiveKpiBar({
  online,
  total,
  todayAlerts,
  avgLatencyMs,
  aiHealthy,
}: LiveKpiBarProps) {
  const metrics: { label: string; value: string; tone: Tone }[] = [
    {
      label: "Камер онлайн",
      value: `${online}/${total}`,
      tone: total > 0 && online === total ? "ok" : online > 0 ? "warn" : "bad",
    },
    { label: "Өнөөдрийн дохио", value: String(todayAlerts), tone: "plain" },
    {
      label: "Дундаж хариу",
      value: avgLatencyMs != null ? `${(avgLatencyMs / 1000).toFixed(1)}с` : "—",
      tone: "plain",
    },
    {
      label: "AI",
      value: aiHealthy ? "Эрүүл" : "Идэвхгүй",
      tone: aiHealthy ? "ok" : "bad",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="rounded-(--radius) bg-(--color-muted)/50 px-3 py-2"
        >
          <div className={`text-base font-semibold ${TONE_CLASS[m.tone]}`}>
            {m.value}
          </div>
          <div className="text-[11px] text-(--color-muted-foreground)">
            {m.label}
          </div>
        </div>
      ))}
    </div>
  );
}
