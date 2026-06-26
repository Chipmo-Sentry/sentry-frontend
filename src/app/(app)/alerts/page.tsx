"use client";

import { Badge, Button, EmptyState, ErrorState, Spinner } from "@chipmo-sentry/ui-kit";
import type { CellStyle, ColDef, ICellRendererParams } from "ag-grid-community";
import { Bell, BellRing, Check, HelpCircle, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DataGrid } from "@/components/datagrid/DataGrid";
import { useToast } from "@/components/Toaster";
import { alerts as alertsApi, feedback } from "@/lib/api";
import { useAlertStreamContext } from "@/lib/alert-stream-context";
import { CATEGORY_LABEL, LEVEL_LABEL, VERDICT_LABEL } from "@/lib/labels";
import { clock, dayKey } from "@/lib/time";
import type {
  AlertCategory,
  AlertLevel,
  AlertPublic,
  FeedbackVerdict,
} from "@/lib/types";

// All alerts are loaded up front (CHUNK-sized requests) so the grid's per-column
// filters span the full history. Pilot scale is tens to hundreds.
const LOAD_CHUNK = 200;
const LOAD_MAX = 5000;

const LEVEL_TONE: Record<AlertLevel, "ignore" | "log" | "notify" | "review"> = {
  ignore: "ignore",
  log: "log",
  notify: "notify",
  review: "review",
};

// Multi-label action columns (тийм/үгүй per clip).
const ACTIONS: AlertCategory[] = [
  "browsing",
  "cart_pickup",
  "pocket_conceal",
  "bag_conceal",
  "other",
];
const ACTION_SHORT: Record<AlertCategory, string> = {
  browsing: "Хайв",
  cart_pickup: "Сагс",
  pocket_conceal: "Халаас",
  bag_conceal: "Цүнх",
  other: "Бусад",
};
const YES = "тийм";
const NO = "үгүй";

function rowActions(a: AlertPublic): AlertCategory[] {
  return (a.actions as AlertCategory[] | null | undefined) ?? [a.category];
}

interface AlertRow {
  id: string;
  edge_id: string;
  level: string;
  browsing: string;
  cart_pickup: string;
  pocket_conceal: string;
  bag_conceal: string;
  other: string;
  confidence: number;
  reasoning: string;
  day: string;
  time: string;
  model: string;
  latency: string;
  verdict: string;
  verdict_raw: FeedbackVerdict | "";
  _a: AlertPublic;
}

type GridCtx = { mark: (id: string, v: FeedbackVerdict) => void };

const CENTER: CellStyle = { display: "flex", alignItems: "center", justifyContent: "center" };
const MUTED: CellStyle = { color: "var(--color-muted-foreground)" };

// --- cell renderers (module-level → stable) ---------------------------------

function LevelCell(p: ICellRendererParams<AlertRow>) {
  const a = p.data?._a;
  if (!a) return null;
  return <Badge tone={LEVEL_TONE[a.alert_level]}>{LEVEL_LABEL[a.alert_level]}</Badge>;
}

function CheckCell(p: ICellRendererParams<AlertRow>) {
  return p.value === YES ? (
    <Check className="h-3.5 w-3.5 text-[var(--color-success)]" />
  ) : (
    <span className="text-[var(--color-muted-foreground)]">—</span>
  );
}

// Edge clip id — the SAME string shown in the agent-pc «Сэжигтэй» list, so the
// operator can match an alert to its edge clip. Empty for cloud/manual alerts.
function EdgeIdCell(p: ICellRendererParams<AlertRow>) {
  if (!p.value) return <span className="text-[var(--color-muted-foreground)]">—</span>;
  return (
    <span className="block truncate font-mono text-xs text-[var(--color-muted-foreground)]" title={p.value}>
      {p.value}
    </span>
  );
}

function ReasoningCell(p: ICellRendererParams<AlertRow>) {
  return (
    <span className="block truncate text-[var(--color-muted-foreground)]" title={p.value}>
      {p.value}
    </span>
  );
}

const ICON_BTN =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]";

function VerdictCell(p: ICellRendererParams<AlertRow>) {
  const row = p.data;
  if (!row) return null;
  if (row.verdict_raw) {
    return (
      <Badge tone="success">
        <Check className="h-3 w-3" />
        {row.verdict}
      </Badge>
    );
  }
  const mark = (p.context as GridCtx).mark;
  // stopPropagation so a feedback click doesn't also fire the row → detail nav.
  const hit = (v: FeedbackVerdict) => (e: React.MouseEvent) => {
    e.stopPropagation();
    mark(row.id, v);
  };
  return (
    <div className="flex gap-1">
      <button type="button" title="Зөв илрүүлэлт" aria-label="Зөв илрүүлэлт" className={ICON_BTN} onClick={hit("true_positive")}>
        <Check className="h-3.5 w-3.5" />
      </button>
      <button type="button" title="Худал сэрэлт" aria-label="Худал сэрэлт" className={ICON_BTN} onClick={hit("false_positive")}>
        <X className="h-3.5 w-3.5" />
      </button>
      <button type="button" title="Тодорхойгүй" aria-label="Тодорхойгүй" className={ICON_BTN} onClick={hit("unclear")}>
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function AlertsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [all, setAll] = useState<AlertPublic[] | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, FeedbackVerdict>>({});
  const stream = useAlertStreamContext();

  // Load the entire history up front so the grid filters span all records.
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
        description: `${CATEGORY_LABEL[a.category]} · ${Math.round(a.confidence * 100)}%`,
        tone: a.alert_level === "review" ? "danger" : "warning",
      });
    }
  }, [stream.alerts, all, toast]);

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

  // Stable mark — reads latest verdicts via a ref so the grid context never goes
  // stale and the callback identity stays constant.
  const verdictsRef = useRef(verdicts);
  verdictsRef.current = verdicts;
  const pendingRef = useRef<Record<string, boolean>>({});
  const mark = useCallback(
    async (alertId: string, verdict: FeedbackVerdict) => {
      if (pendingRef.current[alertId] || verdictsRef.current[alertId]) return;
      pendingRef.current[alertId] = true;
      try {
        await feedback.create({ alert_id: alertId, verdict });
        setVerdicts((v) => ({ ...v, [alertId]: verdict }));
        toast({ title: "Дүгнэлт хадгалагдлаа", description: VERDICT_LABEL[verdict], tone: "success" });
      } catch (e) {
        toast({
          title: "Дүгнэлт хадгалагдсангүй",
          description: e instanceof Error ? e.message : "Алдаа гарлаа",
          tone: "danger",
        });
      } finally {
        delete pendingRef.current[alertId];
      }
    },
    [toast],
  );
  const gridContext = useMemo<GridCtx>(() => ({ mark }), [mark]);

  const rowData = useMemo<AlertRow[]>(() => {
    return merged.map((a) => {
      const acts = rowActions(a);
      const v = verdicts[a.id] ?? a.feedback_verdict ?? "";
      return {
        id: a.id,
        edge_id: a.edge_clip_id ?? "",
        level: LEVEL_LABEL[a.alert_level],
        browsing: acts.includes("browsing") ? YES : NO,
        cart_pickup: acts.includes("cart_pickup") ? YES : NO,
        pocket_conceal: acts.includes("pocket_conceal") ? YES : NO,
        bag_conceal: acts.includes("bag_conceal") ? YES : NO,
        other: acts.includes("other") ? YES : NO,
        confidence: Math.round(a.confidence * 100),
        reasoning: a.reasoning,
        day: dayKey(a.created_at),
        time: clock(a.created_at),
        model: a.model_name,
        latency:
          a.inference_latency_ms != null
            ? `${(a.inference_latency_ms / 1000).toFixed(1)}с`
            : "—",
        verdict: v ? VERDICT_LABEL[v] : "Хариулаагүй",
        verdict_raw: v || "",
        _a: a,
      };
    });
  }, [merged, verdicts]);

  const columnDefs = useMemo<ColDef<AlertRow>[]>(() => {
    const actionCols: ColDef<AlertRow>[] = ACTIONS.map((c) => ({
      field: c,
      headerName: ACTION_SHORT[c],
      headerTooltip: CATEGORY_LABEL[c],
      width: 92,
      flex: 0,
      cellRenderer: CheckCell,
      cellStyle: CENTER,
    }));
    return [
      { field: "level", headerName: "Түвшин", width: 120, flex: 0, cellRenderer: LevelCell },
      ...actionCols,
      { field: "confidence", headerName: "Итгэл", width: 100, flex: 0, type: "rightAligned", valueFormatter: (p) => `${p.value}%` },
      { field: "reasoning", headerName: "Шалтгаан", flex: 2, minWidth: 200, tooltipField: "reasoning", cellRenderer: ReasoningCell },
      { field: "day", headerName: "Огноо", width: 120, flex: 0, cellStyle: MUTED },
      { field: "time", headerName: "Цаг", width: 90, flex: 0, cellStyle: MUTED },
      { field: "edge_id", headerName: "ID", width: 200, flex: 0, tooltipField: "edge_id", cellRenderer: EdgeIdCell },
      { field: "model", headerName: "AI", width: 150, flex: 0, cellStyle: MUTED },
      { field: "latency", headerName: "Хугацаа", width: 110, flex: 0, cellStyle: MUTED },
      { field: "verdict", headerName: "Дүгнэлт", width: 170, flex: 0, cellRenderer: VerdictCell },
    ];
  }, []);

  if (seedError) {
    return (
      <div className="p-8">
        <ErrorState message={seedError} onRetry={() => window.location.reload()} />
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
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
        <div className="min-h-0 flex-1">
          <DataGrid<AlertRow>
            rowData={rowData}
            columnDefs={columnDefs}
            height="100%"
            rowHeight={44}
            gridOptions={{
              context: gridContext,
              getRowId: (p) => p.data.id,
              pagination: false,
              suppressCellFocus: true,
              rowStyle: { cursor: "pointer" },
              onRowClicked: (e) => {
                if (e.data) router.push(`/alerts/${e.data.id}`);
              },
              rowSelection: {
                mode: "singleRow",
                checkboxes: false,
                enableClickSelection: false,
              },
            }}
          />
        </div>
      )}
    </div>
  );
}
