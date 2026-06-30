"use client";

import { riskColor } from "@chipmo-sentry/ui-kit";
import { Bell, ExternalLink } from "lucide-react";
import Link from "next/link";

import { relativeTime } from "@/lib/time";
import type { AlertPublic } from "@/lib/types";

/** AlertCategory → Mongolian display label. */
const CATEGORY_LABEL: Record<string, string> = {
  browsing: "Сонжиж байна",
  cart_pickup: "Сагсанд авав",
  pocket_conceal: "Халаасанд нуув",
  bag_conceal: "Цүнхэнд нуув",
  other: "Сэжигтэй үйлдэл",
};

/** When peak_risk_pct is absent, approximate a band from the alert level so the
 * card still gets a sensible colour. */
const LEVEL_FALLBACK_PCT: Record<string, number> = {
  ignore: 5,
  log: 10,
  notify: 40,
  review: 80,
};

function alertColor(a: AlertPublic): string {
  const pct = a.peak_risk_pct ?? LEVEL_FALLBACK_PCT[a.alert_level] ?? 5;
  return riskColor(pct);
}

export type LiveAlertRailProps = {
  alerts: AlertPublic[];
  connected: boolean;
  /** DB camera id → { path, name } so a card can name its camera + pin it. */
  camById: Record<string, { path: string; name: string }>;
  /** behavior key → Mongolian label (from /api/v1/behaviors) for the "why" line. */
  behaviorLabels?: Record<string, string>;
  /** Click a card → promote its camera to the spotlight. */
  onSelectCamera: (path: string) => void;
};

/**
 * Smart-console alert rail — a live, newest-first feed of recent alerts. The
 * operator's worklist: each card shows the category, peak risk, the behaviour
 * sequence that drove it, the camera, and how long ago. Click to jump the
 * spotlight to that camera. Data is owned by the page (stream + seed merge).
 */
export function LiveAlertRail({
  alerts,
  connected,
  camById,
  behaviorLabels = {},
  onSelectCamera,
}: LiveAlertRailProps) {
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-(--radius) border border-(--color-border) bg-(--color-background)">
      <header className="flex items-center justify-between border-b border-(--color-border) px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-(--color-foreground)">
          <Bell className="h-4 w-4" aria-hidden />
          Дохионы урсгал
        </span>
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            connected ? "bg-green-400" : "bg-gray-500"
          }`}
          title={connected ? "Холбогдсон" : "Холболтгүй"}
          aria-hidden
        />
      </header>

      <div className="flex-1 space-y-2 overflow-auto p-2">
        {alerts.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-(--color-muted-foreground)">
            Одоогоор дохио алга
          </p>
        ) : (
          alerts.map((a) => {
            const color = alertColor(a);
            const cam = a.camera_id ? camById[a.camera_id] : undefined;
            const why = (a.triggered_behaviors ?? [])
              .map((k) => behaviorLabels[k] ?? k)
              .slice(0, 3)
              .join(" → ");
            const verdict =
              a.model_name && a.confidence != null
                ? `AI ${Math.round(a.confidence * 100)}%`
                : null;
            return (
              <div
                key={a.id}
                onClick={() => cam && onSelectCamera(cam.path)}
                className={`rounded-lg border border-(--color-border) bg-(--color-muted)/40 p-2 transition ${
                  cam ? "cursor-pointer hover:bg-(--color-muted)" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-(--color-foreground)">
                    {CATEGORY_LABEL[a.category] ?? "Сэжигтэй үйлдэл"}
                  </span>
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: color }}
                  >
                    {a.peak_risk_pct != null
                      ? `${a.peak_risk_pct.toFixed(0)}%`
                      : "•"}
                  </span>
                </div>
                {why && (
                  <p className="mt-1 truncate text-[11px] text-(--color-muted-foreground)">
                    {why}
                  </p>
                )}
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-(--color-muted-foreground)">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{cam?.name ?? "Камер"}</span>
                    {verdict && (
                      <span
                        className="shrink-0 rounded bg-(--color-primary)/15 px-1 py-0.5 font-medium text-blue-300"
                        title={a.reasoning || undefined}
                      >
                        {verdict}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span>{relativeTime(a.created_at)}</span>
                    <Link
                      href={`/alerts/${a.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-blue-300 transition-colors hover:text-blue-200"
                      aria-label="Дэлгэрэнгүй харах"
                      title="Дэлгэрэнгүй"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </Link>
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
