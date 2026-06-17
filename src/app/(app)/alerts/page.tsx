"use client";

import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Select,
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
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/Toaster";
import { alerts as alertsApi, feedback } from "@/lib/api";
import { useAlertStreamContext } from "@/lib/alert-stream-context";
import { CATEGORY_LABEL, LEVEL_LABEL, VERDICT_LABEL } from "@/lib/labels";
import { clock, dayKey, relativeTime } from "@/lib/time";
import type {
  AlertCategory,
  AlertLevel,
  AlertPublic,
  FeedbackVerdict,
} from "@/lib/types";

// Rows per page (client-side). All alerts are loaded up front so every filter
// works across the full history, not just the current page.
const PAGE_SIZE = 50;
// Safety cap on the up-front load (CHUNK-sized requests). Pilot scale is tens to
// hundreds; revisit with server-side filtering if a store ever exceeds this.
const LOAD_CHUNK = 200;
const LOAD_MAX = 5000;

const LEVEL_TONE: Record<AlertLevel, "ignore" | "log" | "notify" | "review"> = {
  ignore: "ignore",
  log: "log",
  notify: "notify",
  review: "review",
};

type LevelFilter = "all" | "actionable" | AlertLevel;
type CategoryFilter = "all" | AlertCategory;
type VerdictFilter = "all" | "unanswered" | FeedbackVerdict;

const LEVEL_FILTERS: { value: LevelFilter; label: string }[] = [
  { value: "all", label: "Түвшин: бүгд" },
  { value: "actionable", label: "Анхаарах (notify+review)" },
  { value: "review", label: "Шалга" },
  { value: "notify", label: "Анхаар" },
  { value: "log", label: "Бүртгэсэн" },
  { value: "ignore", label: "Үл хамаа" },
];

function matchesLevel(level: AlertLevel, f: LevelFilter): boolean {
  if (f === "all") return true;
  if (f === "actionable") return level === "notify" || level === "review";
  return level === f;
}

const HEADER_SELECT_CLASS =
  "mt-1 h-7 text-xs font-normal normal-case tracking-normal";

export default function AlertsPage() {
  const { toast } = useToast();
  // Full history, loaded once on mount (paged fetch). null = still loading.
  const [all, setAll] = useState<AlertPublic[] | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);

  // Column-header + search filters (all client-side over `merged`).
  const [search, setSearch] = useState("");
  const [levelF, setLevelF] = useState<LevelFilter>("all");
  const [categoryF, setCategoryF] = useState<CategoryFilter>("all");
  const [modelF, setModelF] = useState<string>("all");
  const [verdictF, setVerdictF] = useState<VerdictFilter>("all");
  const [page, setPage] = useState(1);

  const [verdicts, setVerdicts] = useState<Record<string, FeedbackVerdict>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const stream = useAlertStreamContext();

  // Load the entire history up front so filters span all records.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const acc: AlertPublic[] = [];
        for (let offset = 0; offset < LOAD_MAX; offset += LOAD_CHUNK) {
          const batch = await alertsApi.list({ limit: LOAD_CHUNK, offset });
          if (cancelled) return;
          acc.push(...batch);
          if (batch.length < LOAD_CHUNK) break;
        }
        if (!cancelled) setAll(acc);
      } catch (e) {
        if (!cancelled) setSeedError(e instanceof Error ? e.message : "Алдаа");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Toast on each newly streamed alert (after the first render settles).
  const announcedRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);
  useEffect(() => {
    if (all === null) return;
    if (!seededRef.current) {
      for (const a of all) announcedRef.current.add(a.id);
      seededRef.current = true;
    }
    if (announcedRef.current.size > 2000) {
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
  }, [stream.alerts, all, toast]);

  // Merge streamed alerts on top of history, dedup by id.
  const merged: AlertPublic[] = useMemo(() => {
    if (all === null) return stream.alerts;
    const seen = new Set<string>();
    const out: AlertPublic[] = [];
    for (const a of [...stream.alerts, ...all]) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
    return out;
  }, [stream.alerts, all]);

  const models = useMemo(
    () => Array.from(new Set(merged.map((a) => a.model_name))).sort(),
    [merged],
  );

  function effectiveVerdict(a: AlertPublic): FeedbackVerdict | undefined {
    return verdicts[a.id] ?? a.feedback_verdict ?? undefined;
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return merged.filter((a) => {
      if (!matchesLevel(a.alert_level, levelF)) return false;
      if (categoryF !== "all" && a.category !== categoryF) return false;
      if (modelF !== "all" && a.model_name !== modelF) return false;
      if (verdictF !== "all") {
        const v = effectiveVerdict(a);
        if (verdictF === "unanswered" ? v !== undefined : v !== verdictF)
          return false;
      }
      if (q) {
        const hay =
          `${a.reasoning} ${CATEGORY_LABEL[a.category]} ${a.model_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // effectiveVerdict depends on `verdicts`; include it so optimistic clicks
    // re-filter immediately.
  }, [merged, search, levelF, categoryF, modelF, verdictF, verdicts]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Reset to page 1 whenever the filter set changes the result shape.
  useEffect(() => {
    setPage(1);
  }, [search, levelF, categoryF, modelF, verdictF]);
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
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

  function resetFilters() {
    setSearch("");
    setLevelF("all");
    setCategoryF("all");
    setModelF("all");
    setVerdictF("all");
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
  if (all === null) {
    return (
      <div className="p-8">
        <Spinner />
      </div>
    );
  }

  const iconBtn =
    "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-50";
  const tdBase = "px-2 py-1 align-middle";

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

      {/* Free-text search (reasoning / category / model) */}
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

      {merged.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Одоогоор үр дүн байхгүй"
          description="Видео илгээгээд AI-аас тайлан хүлээнэ. Шинэ сэрэмжлүүлэг бодит цагт энд гарна."
          action={
            <Link href="/clips/upload">
              <Button>Видео илгээх</Button>
            </Link>
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="align-top">
                  Түвшин
                  <Select
                    value={levelF}
                    onChange={(e) => setLevelF(e.target.value as LevelFilter)}
                    className={HEADER_SELECT_CLASS}
                    aria-label="Түвшингээр шүүх"
                  >
                    {LEVEL_FILTERS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </TableHead>
                <TableHead className="align-top">
                  Ангилал
                  <Select
                    value={categoryF}
                    onChange={(e) =>
                      setCategoryF(e.target.value as CategoryFilter)
                    }
                    className={HEADER_SELECT_CLASS}
                    aria-label="Ангилалаар шүүх"
                  >
                    <option value="all">Бүгд</option>
                    {(
                      Object.keys(CATEGORY_LABEL) as AlertCategory[]
                    ).map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </Select>
                </TableHead>
                <TableHead className="w-full align-top">Шалтгаан</TableHead>
                <TableHead className="align-top">Огноо</TableHead>
                <TableHead className="align-top">Цаг</TableHead>
                <TableHead className="align-top">
                  AI
                  <Select
                    value={modelF}
                    onChange={(e) => setModelF(e.target.value)}
                    className={HEADER_SELECT_CLASS}
                    aria-label="Загвараар шүүх"
                  >
                    <option value="all">Бүгд</option>
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </TableHead>
                <TableHead className="align-top">Хугацаа</TableHead>
                <TableHead className="align-top">
                  Дүгнэлт
                  <Select
                    value={verdictF}
                    onChange={(e) =>
                      setVerdictF(e.target.value as VerdictFilter)
                    }
                    className={HEADER_SELECT_CLASS}
                    aria-label="Дүгнэлтээр шүүх"
                  >
                    <option value="all">Бүгд</option>
                    <option value="unanswered">Хариулаагүй</option>
                    {(
                      Object.keys(VERDICT_LABEL) as FeedbackVerdict[]
                    ).map((v) => (
                      <option key={v} value={v}>
                        {VERDICT_LABEL[v]}
                      </option>
                    ))}
                  </Select>
                </TableHead>
                <TableHead className="align-top" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((a) => {
                const verdict = effectiveVerdict(a);
                const isPending = pending[a.id];
                return (
                  <TableRow key={a.id}>
                    <TableCell className={`${tdBase} whitespace-nowrap`}>
                      <Badge tone={LEVEL_TONE[a.alert_level]}>
                        {LEVEL_LABEL[a.alert_level]}
                      </Badge>
                    </TableCell>
                    <TableCell className={`${tdBase} whitespace-nowrap`}>
                      <span className="font-medium">
                        {CATEGORY_LABEL[a.category]}
                      </span>{" "}
                      <span className="text-[var(--color-muted-foreground)]">
                        {Math.round(a.confidence * 100)}%
                      </span>
                    </TableCell>
                    <TableCell className={`${tdBase} w-full max-w-0`}>
                      <span
                        className="block truncate text-[var(--color-muted-foreground)]"
                        title={a.reasoning}
                      >
                        {a.reasoning}
                      </span>
                    </TableCell>
                    <TableCell
                      className={`${tdBase} whitespace-nowrap text-[var(--color-muted-foreground)]`}
                      title={relativeTime(a.created_at)}
                    >
                      {dayKey(a.created_at)}
                    </TableCell>
                    <TableCell
                      className={`${tdBase} whitespace-nowrap tabular-nums text-[var(--color-muted-foreground)]`}
                    >
                      {clock(a.created_at)}
                    </TableCell>
                    <TableCell
                      className={`${tdBase} whitespace-nowrap text-xs text-[var(--color-muted-foreground)]`}
                    >
                      {a.model_name}
                    </TableCell>
                    <TableCell
                      className={`${tdBase} whitespace-nowrap tabular-nums text-[var(--color-muted-foreground)]`}
                    >
                      {a.inference_latency_ms != null
                        ? `${(a.inference_latency_ms / 1000).toFixed(1)}с`
                        : "—"}
                    </TableCell>
                    <TableCell className={`${tdBase} whitespace-nowrap`}>
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
                            className={iconBtn}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Худал сэрэлт"
                            aria-label="Худал сэрэлт"
                            disabled={isPending}
                            onClick={() => mark(a.id, "false_positive")}
                            className={iconBtn}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Тодорхойгүй"
                            aria-label="Тодорхойгүй"
                            disabled={isPending}
                            onClick={() => mark(a.id, "unclear")}
                            className={iconBtn}
                          >
                            <HelpCircle className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className={`${tdBase} whitespace-nowrap text-right`}>
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

          {visible.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={Bell}
                title="Тохирох сэрэмжлүүлэг алга"
                description="Шүүлтүүр эсвэл хайлтаа өөрчилж үзнэ үү."
                action={
                  <Button variant="outline" onClick={resetFilters}>
                    Шүүлтүүр цэвэрлэх
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="mt-4 flex items-center justify-between text-sm text-[var(--color-muted-foreground)]">
              <span>
                {filtered.length} илэрц
                {filtered.length !== merged.length
                  ? ` (нийт ${merged.length})`
                  : ""}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Өмнөх
                </Button>
                <span className="tabular-nums">
                  Хуудас {safePage} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  Дараах
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
