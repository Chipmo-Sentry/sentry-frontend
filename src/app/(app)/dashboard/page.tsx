"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
} from "@chipmo-sentry/ui-kit";
import { useEffect, useState } from "react";

import { alerts } from "@/lib/api";

export default function DashboardPage() {
  const [counts, setCounts] = useState<{
    total: number;
    notify: number;
    review: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const recent = await alerts.list({ limit: 200 });
        if (cancelled) return;
        setCounts({
          total: recent.length,
          notify: recent.filter((a) => a.alert_level === "notify").length,
          review: recent.filter((a) => a.alert_level === "review").length,
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Алдаа");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-semibold">Самбар</h1>
      {loading ? (
        <Spinner label="Уншиж байна…" />
      ) : error ? (
        <p className="text-[var(--color-danger)]">{error}</p>
      ) : counts ? (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Нийт сүүлийн event" value={counts.total} />
          <StatCard
            label="Анхаарал татах"
            value={counts.notify}
            tone="notify"
          />
          <StatCard
            label="Шалгах ёстой"
            value={counts.review}
            tone="review"
          />
        </div>
      ) : null}
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
