"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  Spinner,
} from "@chipmo-sentry/ui-kit";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { alerts as alertsApi, behaviors as behaviorsApi, clips, feedback } from "@/lib/api";
import { CATEGORY_LABEL, LEVEL_LABEL, VERDICT_LABEL } from "@/lib/labels";
import type { AlertLevel, AlertPublic, ClipPublic, FeedbackVerdict } from "@/lib/types";

const LEVEL_TONE: Record<AlertLevel, "ignore" | "log" | "notify" | "review"> = {
  ignore: "ignore",
  log: "log",
  notify: "notify",
  review: "review",
};

// Same-origin (empty) base so the clip <video> src goes through the Next `/api`
// proxy and carries the httpOnly cookie. An absolute base drops the cookie and
// the clip 401s in prod — keep this in lockstep with src/lib/api.ts.
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export default function AlertDetailPage() {
  const params = useParams<{ id: string }>();
  const alertId = params.id;

  const [alert, setAlert] = useState<AlertPublic | null>(null);
  const [clip, setClip] = useState<ClipPublic | null>(null);
  // The clip ROW can exist while its FILE is gone (retention, or wiped from
  // ephemeral disk before a Volume was attached) → the <video> 410s. Show a
  // clear message instead of a black player.
  const [clipUnavailable, setClipUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<FeedbackVerdict | null>(null);
  const [feedbackSent, setFeedbackSent] = useState<FeedbackVerdict | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  // Criterion key → Mongolian label (best-effort; raw keys on failure).
  const [behaviorLabels, setBehaviorLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    behaviorsApi.get().then(
      (cfg) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const d of cfg.dimensions) map[d.key] = d.label_mn;
        setBehaviorLabels(map);
      },
      () => {
        /* keys shown raw */
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(() => {
    setError(null);
    setAlert(null);
    setClip(null);
    let cancelled = false;
    (async () => {
      try {
        const a = await alertsApi.get(alertId);
        if (cancelled) return;
        setAlert(a);
        const c = await clips.get(a.clip_id);
        if (!cancelled) setClip(c);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Алдаа");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [alertId]);

  useEffect(() => load(), [load]);

  async function sendFeedback(verdict: FeedbackVerdict) {
    setSubmitting(verdict);
    setFeedbackError(null);
    try {
      await feedback.create({ alert_id: alertId, verdict });
      setFeedbackSent(verdict);
    } catch (e) {
      setFeedbackError(
        e instanceof Error ? e.message : "Дүгнэлт хадгалагдсангүй",
      );
    } finally {
      setSubmitting(null);
    }
  }

  if (error) {
    return (
      <div className="p-8">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
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
            clipUnavailable ? (
              <div className="flex min-h-32 flex-col items-center justify-center gap-1 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-muted)] p-6 text-center">
                <p className="text-sm font-medium">Бичлэг боломжгүй</p>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  Энэ бичлэг серверт байхгүй болсон (хадгалалтын Volume
                  тохируулагдаагүй эсвэл хугацаа дууссан). Шинэ бичлэгүүд
                  хадгалалт тохируулсны дараа хадгалагдана.
                </p>
              </div>
            ) : (
              <video
                controls
                preload="metadata"
                className="w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-black"
                src={`${BASE}/api/v1/clips/${clip.id}/download`}
                onError={() => setClipUnavailable(true)}
              >
                <track kind="captions" />
                Хөтөч таны видеог дэмжихгүй.
              </video>
            )
          ) : (
            <Spinner label="Клип уншиж байна…" />
          )}

          <section>
            <h3 className="mb-1 text-sm font-semibold">AI тайлбар</h3>
            <p className="text-sm text-[var(--color-foreground)]">
              {alert.reasoning}
            </p>
          </section>

          {/* Neutral-fallback hint: confidence 0 + "other" is what the VLM
              returns after it FAILS to parse a verdict (retries exhausted) — it
              is NOT the same as a genuine "no theft" all-clear. Surface the
              ambiguity so an operator doesn't read a model failure as innocence. */}
          {alert.confidence === 0 && alert.category === "other" && (
            <p
              className="rounded-[var(--radius)] border px-3 py-2 text-xs"
              style={{
                borderColor: "var(--color-warning)",
                color: "var(--color-warning)",
                background: "color-mix(in srgb, var(--color-warning) 10%, transparent)",
              }}
            >
              VLM энэ клипийг тодорхой үнэлж чадаагүй байж магадгүй (итгэл 0%). Энэ нь
              «зөрчилгүй» гэсэн баталгаа БИШ — бичлэгийг өөрөө шалгана уу.
            </p>
          )}

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

          {/* Itemized breakdown — each criterion's accumulated score (grouped),
              the grand total banked, and the engine's peak risk score. The
              richest view of what built this breach. */}
          {(alert.triggered_behavior_detail?.length ?? 0) > 0 &&
            (() => {
              const detail = alert.triggered_behavior_detail!;
              const byKey = new Map<string, { count: number; score: number }>();
              for (const r of detail) {
                const e = byKey.get(r.key) ?? { count: 0, score: 0 };
                e.count += 1;
                e.score += r.score;
                byKey.set(r.key, e);
              }
              const rows = Array.from(byKey, ([key, v]) => ({ key, ...v })).sort(
                (a, b) => b.score - a.score,
              );
              const total = detail.reduce((s, r) => s + r.score, 0);
              return (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">
                    Сэжиг шалгуурын задаргаа
                  </h3>
                  <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)]">
                    <table className="w-full text-sm">
                      <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">
                            Сэжиг шалгуур
                          </th>
                          <th className="px-3 py-2 text-right font-medium">Удаа</th>
                          <th className="px-3 py-2 text-right font-medium">
                            Цугларсан оноо
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr
                            key={r.key}
                            className="border-t border-[var(--color-border)]"
                          >
                            <td className="px-3 py-2">
                              {behaviorLabels[r.key] ?? r.key}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--color-muted-foreground)]">
                              {r.count}
                            </td>
                            <td className="px-3 py-2 text-right font-medium tabular-nums">
                              +{Math.round(r.score)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-[var(--color-border)] font-semibold">
                          <td className="px-3 py-2">Нийт</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {detail.length}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            +{Math.round(total)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="rounded-[var(--radius)] border border-[var(--color-border)] p-3">
                      <div className="text-xs text-[var(--color-muted-foreground)]">
                        Нийт цугларсан оноо
                      </div>
                      <div className="mt-0.5 text-xl font-semibold">
                        +{Math.round(total)}
                      </div>
                    </div>
                    {alert.peak_risk_pct != null && (
                      <div className="rounded-[var(--radius)] border border-[var(--color-border)] p-3">
                        <div className="text-xs text-[var(--color-muted-foreground)]">
                          Эрсдэлийн оноо (0–100)
                        </div>
                        <div
                          className="mt-0.5 text-xl font-semibold"
                          style={{ color: "var(--color-warning)" }}
                        >
                          {alert.peak_risk_pct.toFixed(0)}
                        </div>
                      </div>
                    )}
                    <div className="rounded-[var(--radius)] border border-[var(--color-border)] p-3">
                      <div className="text-xs text-[var(--color-muted-foreground)]">
                        Түвшин
                      </div>
                      <div className="mt-1">
                        <Badge tone={LEVEL_TONE[alert.alert_level]}>
                          {LEVEL_LABEL[alert.alert_level]}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })()}

          {/* Fallback chips when there's no detailed timeline (manual uploads /
              older alerts) + completed sequences (always shown — separate). */}
          {(((alert.triggered_behaviors?.length ?? 0) > 0 &&
            (alert.triggered_behavior_detail?.length ?? 0) === 0) ||
            (alert.triggered_sequences?.length ?? 0) > 0) && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">
                Илэрсэн сэжиг шалгуурууд
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                {(alert.triggered_behavior_detail?.length ?? 0) === 0 &&
                  alert.triggered_behaviors?.map((key) => (
                    <Badge key={key} tone="warning">
                      {behaviorLabels[key] ?? key}
                    </Badge>
                  ))}
                {alert.triggered_sequences?.map((key) => (
                  <Badge key={`seq-${key}`} tone="danger">
                    ⛓ {behaviorLabels[key] ?? key}
                  </Badge>
                ))}
              </div>
            </section>
          )}

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
            {/* Settled verdict = this session's submit OR the persisted server
                value, so re-opening a reviewed alert shows the answer instead of
                re-asking. */}
            {(feedbackSent ?? alert.feedback_verdict) ? (
              <Badge tone="success">
                ✓ Хадгалсан:{" "}
                {VERDICT_LABEL[(feedbackSent ?? alert.feedback_verdict)!]}
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
            {feedbackError ? (
              <p
                role="alert"
                className="mt-2 text-sm text-[var(--color-danger)]"
              >
                {feedbackError}
              </p>
            ) : null}
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
