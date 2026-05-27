"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Spinner,
} from "@chipmo-sentry/ui-kit";
import { Bell, BellRing } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { alerts as alertsApi, feedback } from "@/lib/api";
import { useAlertStream } from "@/lib/sse";
import type { AlertLevel, AlertPublic, FeedbackVerdict } from "@/lib/types";

const CATEGORY_LABEL: Record<AlertPublic["category"], string> = {
  browsing: "Хайж байгаа",
  cart_pickup: "Сагсанд авсан",
  pocket_conceal: "Халаасанд хийсэн",
  other: "Бусад",
};

const LEVEL_TONE: Record<AlertLevel, "ignore" | "log" | "notify" | "review"> = {
  ignore: "ignore",
  log: "log",
  notify: "notify",
  review: "review",
};

const LEVEL_LABEL: Record<AlertLevel, string> = {
  ignore: "Үл хамаа",
  log: "Бүртгэсэн",
  notify: "Анхаар",
  review: "Шалга",
};

export default function AlertsPage() {
  const [seed, setSeed] = useState<AlertPublic[] | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const stream = useAlertStream();

  // One-time fetch on mount so we render history; SSE prepends new items as
  // they arrive.
  useEffect(() => {
    let cancelled = false;
    alertsApi.list({ limit: 50 }).then(
      (list) => {
        if (!cancelled) setSeed(list);
      },
      (e) => {
        if (!cancelled) setSeedError(e instanceof Error ? e.message : "Алдаа");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Merge streamed alerts on top of seed, dedup by id
  const merged: AlertPublic[] = (() => {
    if (seed === null) return stream.alerts;
    const seen = new Set<string>();
    const out: AlertPublic[] = [];
    for (const a of [...stream.alerts, ...seed]) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
    return out;
  })();

  async function mark(alertId: string, verdict: FeedbackVerdict) {
    try {
      await feedback.create({ alert_id: alertId, verdict });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Дүгнэлт хадгалагдсангүй");
    }
  }

  if (seedError) {
    return <p className="p-8 text-[var(--color-danger)]">{seedError}</p>;
  }
  if (seed === null) {
    return (
      <div className="p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Сэжигтэй үйлдэл</h1>
        <Badge tone={stream.connected ? "success" : "warning"}>
          {stream.connected ? (
            <>
              <BellRing className="h-3 w-3" />
              Real-time холбогдсон
            </>
          ) : (
            <>
              <Bell className="h-3 w-3" />
              Холболтгүй
            </>
          )}
        </Badge>
      </div>

      {merged.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Одоогоор үр дүн байхгүй"
          description="Видео илгээгээд AI-аас тайлан хүлээнэ. Шинэ event-ууд real-time-д энд гарна."
          action={
            <Link href="/clips/upload">
              <Button>Видео илгээх</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {merged.map((a) => (
            <Card key={a.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={LEVEL_TONE[a.alert_level]}>
                        {LEVEL_LABEL[a.alert_level]}
                      </Badge>
                      <CardTitle className="text-base">
                        {CATEGORY_LABEL[a.category]}
                        <span className="ml-2 text-sm font-normal text-[var(--color-muted-foreground)]">
                          ({Math.round(a.confidence * 100)}%)
                        </span>
                      </CardTitle>
                    </div>
                    <CardDescription>
                      {new Date(a.created_at).toLocaleString("mn-MN")} ·{" "}
                      {a.model_name} · {a.inference_latency_ms}ms
                    </CardDescription>
                  </div>
                  <Link
                    href={`/alerts/${a.id}`}
                    className="text-sm text-[var(--color-primary)] underline-offset-2 hover:underline"
                  >
                    Дэлгэрэнгүй
                  </Link>
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
      )}
    </div>
  );
}
