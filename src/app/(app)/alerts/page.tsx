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
import { Bell, BellRing, Check, HelpCircle, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useToast } from "@/components/Toaster";
import { alerts as alertsApi, feedback } from "@/lib/api";
import { useAlertStream } from "@/lib/sse";
import { relativeTime } from "@/lib/time";
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

const VERDICT_LABEL: Record<FeedbackVerdict, string> = {
  true_positive: "Зөв илрүүлэлт",
  false_positive: "Худал сэрэлт",
  unclear: "Тодорхойгүй",
};

type Filter = "all" | "actionable" | AlertLevel;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Бүгд" },
  { value: "actionable", label: "Анхаарах (notify+review)" },
  { value: "review", label: "Шалга" },
  { value: "notify", label: "Анхаар" },
  { value: "log", label: "Бүртгэсэн" },
];

function matchesFilter(level: AlertLevel, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "actionable") return level === "notify" || level === "review";
  return level === filter;
}

export default function AlertsPage() {
  const { toast } = useToast();
  const [seed, setSeed] = useState<AlertPublic[] | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  // alert id -> verdict the user submitted this session
  const [verdicts, setVerdicts] = useState<Record<string, FeedbackVerdict>>({});
  // alert id -> true while a feedback request is in flight
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const stream = useAlertStream();

  // One-time fetch on mount so we render history; SSE prepends new items.
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

  // Toast on each newly streamed alert (after the first render settles).
  const announcedRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);
  useEffect(() => {
    if (seed === null) return;
    // Mark all seeded ids as already-seen so we don't toast history.
    if (!seededRef.current) {
      for (const a of seed) announcedRef.current.add(a.id);
      seededRef.current = true;
    }
    for (const a of stream.alerts) {
      if (announcedRef.current.has(a.id)) continue;
      announcedRef.current.add(a.id);
      toast({
        title: `Шинэ event — ${LEVEL_LABEL[a.alert_level]}`,
        description: `${CATEGORY_LABEL[a.category]} · ${Math.round(
          a.confidence * 100,
        )}%`,
        tone: a.alert_level === "review" ? "danger" : "warning",
      });
    }
  }, [stream.alerts, seed, toast]);

  // Merge streamed alerts on top of seed, dedup by id.
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

  const visible = merged.filter((a) => matchesFilter(a.alert_level, filter));

  async function mark(alertId: string, verdict: FeedbackVerdict) {
    if (pending[alertId] || verdicts[alertId]) return;
    setPending((p) => ({ ...p, [alertId]: true }));
    try {
      await feedback.create({ alert_id: alertId, verdict });
      setVerdicts((v) => ({ ...v, [alertId]: verdict }));
      toast({
        title: "Дүгнэлт хадгалагдлаа",
        description: VERDICT_LABEL[verdict],
        tone: "success",
      });
    } catch (e) {
      toast({
        title: "Дүгнэлт хадгалагдсангүй",
        description: e instanceof Error ? e.message : "Алдаа гарлаа",
        tone: "danger",
      });
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[alertId];
        return next;
      });
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

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          const count = merged.filter((a) =>
            matchesFilter(a.alert_level, f.value),
          ).length;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={active}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : "border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
              }`}
            >
              {f.label}
              <span className="ml-1.5 opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={
            merged.length === 0
              ? "Одоогоор үр дүн байхгүй"
              : "Энэ шүүлтүүрт тохирох event алга"
          }
          description={
            merged.length === 0
              ? "Видео илгээгээд AI-аас тайлан хүлээнэ. Шинэ event-ууд real-time-д энд гарна."
              : "Өөр шүүлтүүр сонгож үзнэ үү."
          }
          action={
            merged.length === 0 ? (
              <Link href="/clips/upload">
                <Button>Видео илгээх</Button>
              </Link>
            ) : (
              <Button variant="outline" onClick={() => setFilter("all")}>
                Бүгдийг харах
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((a) => {
            const verdict = verdicts[a.id];
            const isPending = pending[a.id];
            return (
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
                        <span title={new Date(a.created_at).toLocaleString("mn-MN")}>
                          {relativeTime(a.created_at)}
                        </span>{" "}
                        · {a.model_name} · {a.inference_latency_ms}ms
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
                  {verdict ? (
                    <div className="mt-3">
                      <Badge tone="success">
                        <Check className="h-3 w-3" />
                        Дүгнэсэн: {VERDICT_LABEL[verdict]}
                      </Badge>
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => mark(a.id, "true_positive")}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Зөв илрүүлэлт
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => mark(a.id, "false_positive")}
                      >
                        <X className="h-3.5 w-3.5" />
                        Худал сэрэлт
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => mark(a.id, "unclear")}
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                        Тодорхойгүй
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
