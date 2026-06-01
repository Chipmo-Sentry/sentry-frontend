"use client";

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Spinner,
} from "@chipmo-sentry/ui-kit";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { alerts as alertsApi } from "@/lib/api";
import { relativeTime } from "@/lib/time";
import type { AlertPublic } from "@/lib/types";

const CATEGORY_LABEL: Record<AlertPublic["category"], string> = {
  browsing: "Хайж байгаа",
  cart_pickup: "Сагсанд авсан",
  pocket_conceal: "Халаасанд хийсэн",
  other: "Бусад",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY = ["Ня", "Да", "Мя", "Лх", "Пү", "Ба", "Бя"];

export default function DashboardPage() {
  const [data, setData] = useState<AlertPublic[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    alertsApi.list({ limit: 200 }).then(
      (list) => {
        if (!cancelled) setData(list);
      },
      (e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Алдаа");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    if (!data) return null;
    return {
      total: data.length,
      notify: data.filter((a) => a.alert_level === "notify").length,
      review: data.filter((a) => a.alert_level === "review").length,
    };
  }, [data]);

  // 7-day bins (oldest → newest), counting alerts per local day.
  const trend = useMemo(() => {
    if (!data) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = today.getTime() - 6 * DAY_MS;
    const bins = Array.from({ length: 7 }, (_, i) => {
      const dayStart = start + i * DAY_MS;
      return {
        label: WEEKDAY[new Date(dayStart).getDay()] ?? "",
        count: 0,
      };
    });
    for (const a of data) {
      const t = new Date(a.created_at).getTime();
      if (Number.isNaN(t) || t < start) continue;
      const idx = Math.floor((t - start) / DAY_MS);
      if (idx >= 0 && idx < 7) {
        const bin = bins[idx];
        if (bin) bin.count += 1;
      }
    }
    const max = Math.max(1, ...bins.map((b) => b.count));
    return { bins, max };
  }, [data]);

  const recentReview = useMemo(() => {
    if (!data) return [];
    return data.filter((a) => a.alert_level === "review").slice(0, 5);
  }, [data]);

  if (error) {
    return <p className="p-8 text-[var(--color-danger)]">{error}</p>;
  }
  if (!counts || !trend) {
    return (
      <div className="p-8">
        <Spinner label="Уншиж байна…" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Самбар</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Нийт сүүлийн event" value={counts.total} />
        <StatCard label="Анхаарал татах" value={counts.notify} tone="notify" />
        <StatCard label="Шалгах ёстой" value={counts.review} tone="review" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 7-day trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Сүүлийн 7 хоног</CardTitle>
            <CardDescription>Өдөр тутмын event-ийн тоо</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-32 items-end gap-2">
              {trend.bins.map((b, i) => (
                <div
                  key={i}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${b.label}: ${b.count}`}
                >
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {b.count}
                  </span>
                  <div
                    className="w-full rounded-t bg-[var(--color-primary)]"
                    style={{
                      height: `${Math.max(4, (b.count / trend.max) * 96)}px`,
                    }}
                  />
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {b.label}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent review-level alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Шалгах шаардлагатай</CardTitle>
            <CardDescription>Хамгийн сүүлийн review event-ууд</CardDescription>
          </CardHeader>
          <CardContent>
            {recentReview.length === 0 ? (
              <EmptyState
                icon={ShieldAlert}
                title="Review event алга"
                description="Одоогоор шалгах шаардлагатай event бүртгэгдээгүй байна."
              />
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {recentReview.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/alerts/${a.id}`}
                      className="flex items-center justify-between gap-2 py-2.5 transition-colors hover:bg-[var(--color-muted)]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {CATEGORY_LABEL[a.category]}{" "}
                          <span className="text-[var(--color-muted-foreground)]">
                            ({Math.round(a.confidence * 100)}%)
                          </span>
                        </p>
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          {relativeTime(a.created_at)}
                        </p>
                      </div>
                      <Badge tone="review">Шалга</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "notify" | "review";
}) {
  const accent =
    tone === "review"
      ? "text-[var(--color-level-review)]"
      : tone === "notify"
        ? "text-[var(--color-level-notify)]"
        : "text-[var(--color-foreground)]";
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`text-3xl ${accent}`}>{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Сүүлийн 200 event
        </p>
      </CardContent>
    </Card>
  );
}
