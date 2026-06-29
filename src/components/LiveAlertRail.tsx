"use client";

import { riskColor } from "@chipmo-sentry/ui-kit";
import { Bell } from "lucide-react";

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
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => cam && onSelectCamera(cam.path)}
                disabled={!cam}
                className="block w-full rounded-lg border border-(--color-border) bg-(--color-muted)/40 p-2 text-left transition hover:bg-(--color-muted) disabled:cursor-default disabled:hover:bg-(--color-muted)/40"
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
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-(--color-muted-foreground)">
                  <span className="truncate">{cam?.name ?? "Камер"}</span>
                  <span className="shrink-0">{relativeTime(a.created_at)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
