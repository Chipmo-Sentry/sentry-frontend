"use client";

import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chipmo-sentry/ui-kit";
import {
  Bell,
  BellRing,
  Check,
  ChevronRight,
  HelpCircle,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useToast } from "@/components/Toaster";
import { alerts as alertsApi, feedback } from "@/lib/api";
import { useAlertStreamContext } from "@/lib/alert-stream-context";
import { CATEGORY_LABEL, LEVEL_LABEL, VERDICT_LABEL } from "@/lib/labels";
import { relativeTime } from "@/lib/time";
import type { AlertLevel, AlertPublic, FeedbackVerdict } from "@/lib/types";

const PAGE_SIZE = 25;

const LEVEL_TONE: Record<AlertLevel, "ignore" | "log" | "notify" | "review"> = {
  ignore: "ignore",
  log: "log",
  notify: "notify",
  review: "review",
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

function matchesSearch(a: AlertPublic, q: string): boolean {
  if (!q) return true;
  const hay = `${a.reasoning} ${CATEGORY_LABEL[a.category]} ${a.model_name}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

export default function AlertsPage() {
  const { toast } = useToast();
  // Server-paginated history (older alerts appended via "Load more").
  const [history, setHistory] = useState<AlertPublic[] | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [verdicts, setVerdicts] = useState<Record<string, FeedbackVerdict>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const stream = useAlertStreamContext();

  // First page on mount.
  useEffect(() => {
    let cancelled = false;
    alertsApi.list({ limit: PAGE_SIZE, offset: 0 }).then(
      (list) => {
        if (cancelled) return;
        setHistory(list);
        setHasMore(list.length === PAGE_SIZE);
      },
      (e) => {
        if (!cancelled) setSeedError(e instanceof Error ? e.message : "Алдаа");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMore() {
    if (loadingMore || !history) return;
    setLoadingMore(true);
    try {
      const next = await alertsApi.list({
        limit: PAGE_SIZE,
        offset: history.length,
      });
      setHistory((prev) => [...(prev ?? []), ...next]);
      setHasMore(next.length === PAGE_SIZE);
    } catch (e) {
      toast({
        title: "Ачаалж чадсангүй",
        description: e instanceof Error ? e.message : "Алдаа",
        tone: "danger",
      });
    } finally {
      setLoadingMore(false);
    }
  }

  // Toast on each newly streamed alert (after the first render settles).
  const announcedRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);
  useEffect(() => {
    if (history === null) return;
    if (!seededRef.current) {
      for (const a of history) announcedRef.current.add(a.id);
      seededRef.current = true;
    }
    if (announcedRef.current.size > 1000) {
      announcedRef.current = new Set(stream.alerts.map((a) => a.id));
    }
    for (const a of stream.alerts) {
      if (announcedRef.current.has(a.id)) continue;
      announcedRef.current.add(a.id);
      toast({
        title: `Шинэ сэрэмжлүүлэг — ${LEVEL_LABEL[a.alert_level]}`,
        description: `${CATEGORY_LABEL[a.category]} · ${Math.round(
          a.confidence * 100,
        )}%`,
        tone: a.alert_level === "review" ? "danger" : "warning",
      });
    }
  }, [stream.alerts, history, toast]);

  // Merge streamed alerts on top of history, dedup by id.
  const merged: AlertPublic[] = (() => {
    if (history === null) return stream.alerts;
    const seen = new Set<string>();
    const out: AlertPublic[] = [];
    for (const a of [...stream.alerts, ...history]) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
    return out;
  })();

  const visible = merged.filter(
    (a) => matchesFilter(a.alert_level, filter) && matchesSearch(a, search),
  );

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
    return (
      <div className="p-8">
        <ErrorState
          message={seedError}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }
  if (history === null) {
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
              Шууд холбогдсон
            </>
          ) : (
            <>
              <Bell className="h-3 w-3" />
              Холболтгүй
            </>
          )}
        </Badge>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Шалтгаан, ангилал, загвараар хайх…"
          className="pl-9"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Хайлт цэвэрлэх"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
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
              : "Тохирох сэрэмжлүүлэг алга"
          }
          description={
            merged.length === 0
              ? "Видео илгээгээд AI-аас тайлан хүлээнэ. Шинэ сэрэмжлүүлэг бодит цагт энд гарна."
              : "Шүүлтүүр эсвэл хайлтаа өөрчилж үзнэ үү."
          }
          action={
            merged.length === 0 ? (
              <Link href="/clips/upload">
                <Button>Видео илгээх</Button>
              </Link>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setFilter("all");
                  setSearch("");
                }}
              >
                Шүүлтүүр цэвэрлэх
              </Button>
            )
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Түвшин</TableHead>
                <TableHead className="whitespace-nowrap">Ангилал</TableHead>
                <TableHead className="w-full">Шалтгаан</TableHead>
                <TableHead className="whitespace-nowrap">Цаг</TableHead>
                <TableHead className="whitespace-nowrap">AI · хугацаа</TableHead>
                <TableHead className="whitespace-nowrap">Дүгнэлт</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((a) => {
                // Server verdict is the source of truth (persisted feedback); the
                // local map only holds this session's optimistic clicks. Without
                // the server value, a reload dropped the answer and re-asked.
                const verdict = verdicts[a.id] ?? a.feedback_verdict ?? undefined;
                const isPending = pending[a.id];
                return (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">
                      <Badge tone={LEVEL_TONE[a.alert_level]}>
                        {LEVEL_LABEL[a.alert_level]}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="font-medium">
                        {CATEGORY_LABEL[a.category]}
                      </span>{" "}
                      <span className="text-[var(--color-muted-foreground)]">
                        {Math.round(a.confidence * 100)}%
                      </span>
                    </TableCell>
                    <TableCell className="w-full max-w-0">
                      <span
                        className="block truncate text-[var(--color-muted-foreground)]"
                        title={a.reasoning}
                      >
                        {a.reasoning}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[var(--color-muted-foreground)]">
                      <span
                        title={new Date(a.created_at).toLocaleString("mn-MN")}
                      >
                        {relativeTime(a.created_at)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
                      {a.model_name}
                      <br />
                      {a.inference_latency_ms != null
                        ? `${(a.inference_latency_ms / 1000).toFixed(1)}с`
                        : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {verdict ? (
                        <Badge tone="success">
                          <Check className="h-3 w-3" />
                          {VERDICT_LABEL[verdict]}
                        </Badge>
                      ) : (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            title="Зөв илрүүлэлт"
                            aria-label="Зөв илрүүлэлт"
                            disabled={isPending}
                            onClick={() => mark(a.id, "true_positive")}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Худал сэрэлт"
                            aria-label="Худал сэрэлт"
                            disabled={isPending}
                            onClick={() => mark(a.id, "false_positive")}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Тодорхойгүй"
                            aria-label="Тодорхойгүй"
                            disabled={isPending}
                            onClick={() => mark(a.id, "unclear")}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-50"
                          >
                            <HelpCircle className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Link
                        href={`/alerts/${a.id}`}
                        aria-label="Дэлгэрэнгүй"
                        className="inline-flex text-[var(--color-primary)] hover:underline"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Pagination — only when not searching (search is client-side over
              loaded pages, so "load more" still fetches older history). */}
          {hasMore ? (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Ачаалж байна…" : "Цааш үзэх"}
              </Button>
            </div>
          ) : (
            <p className="mt-6 text-center text-xs text-[var(--color-muted-foreground)]">
              Бүх сэрэмжлүүлэг ачаалагдсан
            </p>
          )}
        </>
      )}
    </div>
  );
}
