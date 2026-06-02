"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
} from "@chipmo-sentry/ui-kit";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { alerts as alertsApi, clips, feedback } from "@/lib/api";
import type { AlertLevel, AlertPublic, ClipPublic, FeedbackVerdict } from "@/lib/types";

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

const VERDICT_LABEL: Record<FeedbackVerdict, string> = {
  true_positive: "Зөв илрүүлэлт",
  false_positive: "Худал сэрэлт",
  unclear: "Тодорхойгүй",
};

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function AlertDetailPage() {
  const params = useParams<{ id: string }>();
  const alertId = params.id;

  const [alert, setAlert] = useState<AlertPublic | null>(null);
  const [clip, setClip] = useState<ClipPublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<FeedbackVerdict | null>(null);
  const [feedbackSent, setFeedbackSent] = useState<FeedbackVerdict | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const a = await alertsApi.get(alertId);
        if (cancelled) return;
        setAlert(a);
        const c = await clips.get(a.clip_id);
        if (!cancelled) setClip(c);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Алдаа");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [alertId]);

  async function sendFeedback(verdict: FeedbackVerdict) {
    setSubmitting(verdict);
    try {
      await feedback.create({ alert_id: alertId, verdict });
      setFeedbackSent(verdict);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Дүгнэлт хадгалагдсангүй");
    } finally {
      setSubmitting(null);
    }
  }

  if (error) {
    return <p className="p-8 text-[var(--color-danger)]">{error}</p>;
  }
  if (alert === null) {
    return (
      <div className="p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <Link
        href="/alerts"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Буцах
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge tone={LEVEL_TONE[alert.alert_level]}>
              {LEVEL_LABEL[alert.alert_level]}
            </Badge>
            <CardTitle>
              {CATEGORY_LABEL[alert.category]}
              <span className="ml-2 text-base font-normal text-[var(--color-muted-foreground)]">
                ({Math.round(alert.confidence * 100)}%)
              </span>
            </CardTitle>
          </div>
          <CardDescription>
            {new Date(alert.created_at).toLocaleString("mn-MN")} ·{" "}
            {alert.model_name} · {alert.inference_latency_ms}ms inference
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {clip ? (
            <video
              controls
              preload="metadata"
              className="w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-black"
              src={`${BASE}/api/v1/clips/${clip.id}/download`}
            >
              <track kind="captions" />
              Хөтөч таны видеог дэмжихгүй.
            </video>
          ) : (
            <Spinner label="Клип уншиж байна…" />
          )}

          <section>
            <h3 className="mb-1 text-sm font-semibold">AI тайлбар</h3>
            <p className="text-sm text-[var(--color-foreground)]">
              {alert.reasoning}
            </p>
          </section>

          {/* FE-L9 — trigger source + (for live breaches) tracked person and
              peak accumulated risk. */}
          <section className="flex flex-wrap items-center gap-2">
            <Badge tone={alert.triggered_by === "live_threshold" ? "notify" : "neutral"}>
              {alert.triggered_by === "live_threshold"
                ? "🚨 Шууд хяналт"
                : "Видео илгээлт"}
            </Badge>
            {alert.person_id != null && (
              <Badge tone="neutral">Хүн #{alert.person_id}</Badge>
            )}
            {alert.peak_risk_pct != null && (
              <Badge tone="warning">
                Дээд эрсдэл {alert.peak_risk_pct.toFixed(1)}
              </Badge>
            )}
          </section>

          {clip ? (
            <section className="text-xs text-[var(--color-muted-foreground)]">
              <div>
                Камер: <code className="font-mono">{clip.camera_id ?? "—"}</code>
              </div>
              <div>
                Дэлгүүр: <code className="font-mono">{clip.store_id ?? "—"}</code>
              </div>
              <div>
                Хугацаа: {clip.duration_sec}s · {(clip.file_size_bytes / 1024).toFixed(0)} KB
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 text-sm font-semibold">Дүгнэлт</h3>
            {feedbackSent ? (
              <Badge tone="success">
                ✓ Хадгалсан: {VERDICT_LABEL[feedbackSent]}
              </Badge>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={submitting !== null}
                  onClick={() => sendFeedback("true_positive")}
                >
                  ✓ Зөв илрүүлэлт
                </Button>
                <Button
                  variant="outline"
                  disabled={submitting !== null}
                  onClick={() => sendFeedback("false_positive")}
                >
                  ✗ Худал сэрэлт
                </Button>
                <Button
                  variant="ghost"
                  disabled={submitting !== null}
                  onClick={() => sendFeedback("unclear")}
                >
                  ? Тодорхойгүй
                </Button>
              </div>
            )}
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
