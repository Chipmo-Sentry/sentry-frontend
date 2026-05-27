"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
} from "@chipmo-sentry/ui-kit";
import { useEffect, useState } from "react";

import { alerts as alertsApi, feedback } from "@/lib/api";
import type { AlertPublic, FeedbackVerdict } from "@/lib/types";

const CATEGORY_LABEL: Record<AlertPublic["category"], string> = {
  browsing: "Хайж байгаа",
  cart_pickup: "Сагсанд авсан",
  pocket_conceal: "Халаасанд хийсэн",
  other: "Бусад",
};

const LEVEL_STYLE: Record<AlertPublic["alert_level"], string> = {
  ignore: "bg-[var(--color-level-ignore)]",
  log: "bg-[var(--color-level-log)]",
  notify: "bg-[var(--color-level-notify)]",
  review: "bg-[var(--color-level-review)]",
};

export default function AlertsPage() {
  const [items, setItems] = useState<AlertPublic[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await alertsApi.list({ limit: 50 });
        if (!cancelled) setItems(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Алдаа");
      }
    }
    load();
    // M1: simple polling. Session 2 → SSE EventSource.
    const id = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function mark(alertId: string, verdict: FeedbackVerdict) {
    try {
      await feedback.create({ alert_id: alertId, verdict });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Дүгнэлт хадгалагдсангүй");
    }
  }

  if (error) {
    return <p className="p-8 text-[var(--color-danger)]">{error}</p>;
  }
  if (items === null) {
    return (
      <div className="p-8">
        <Spinner />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="p-8">
        <h1 className="mb-4 text-2xl font-semibold">Сэжигтэй үйлдэл</h1>
        <p className="text-[var(--color-muted-foreground)]">
          Одоогоор үр дүн байхгүй. Видео илгээгээд AI-аас тайлан хүлээнэ.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-semibold">Сэжигтэй үйлдэл</h1>
      <div className="space-y-3">
        {items.map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${LEVEL_STYLE[a.alert_level]}`}
                      aria-hidden
                    />
                    {CATEGORY_LABEL[a.category]}
                    <span className="text-sm font-normal text-[var(--color-muted-foreground)]">
                      ({Math.round(a.confidence * 100)}%)
                    </span>
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {new Date(a.created_at).toLocaleString("mn-MN")} ·{" "}
                    {a.model_name} · {a.inference_latency_ms}ms
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{a.reasoning}</p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => mark(a.id, "true_positive")}
                >
                  ✓ Зөв илрүүлэлт
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => mark(a.id, "false_positive")}
                >
                  ✗ Худал сэрэлт
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => mark(a.id, "unclear")}
                >
                  ? Тодорхойгүй
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
