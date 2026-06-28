"use client";

import { EmptyState, ErrorState, Spinner } from "@chipmo-sentry/ui-kit";
import { Cctv, ChevronRight, Cpu } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { HealthDot } from "@/components/pipeline/ui";
import {
  cameras as camerasApi,
  events as eventsApi,
  ingest as ingestApi,
  nodes as nodesApi,
  stores as storesApi,
  type IngestPathsResponse,
  type OrgNodePublic,
} from "@/lib/api";
import { useAlertStreamContext } from "@/lib/alert-stream-context";
import { EVENT_LABEL } from "@/lib/event-log";
import { computeCameraRows, STATUS_COLOR, worstStatus, type CellStatus } from "@/lib/pipeline";
import { relativeTime } from "@/lib/time";
import type { CameraPublic, EventLogPublic, StorePublic } from "@/lib/types";

const POLL_MS = 8000;
const HEALTH_EVENTS = [
  "node_online",
  "node_offline",
  "camera_stream_down",
  "camera_stream_recovered",
  "agent_online",
  "agent_offline",
];

export function HealthOverview() {
  const [stores, setStores] = useState<StorePublic[] | null>(null);
  const [cameras, setCameras] = useState<CameraPublic[]>([]);
  const [nodeList, setNodeList] = useState<OrgNodePublic[]>([]);
  const [ingest, setIngest] = useState<IngestPathsResponse | null>(null);
  const [events, setEvents] = useState<EventLogPublic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { alerts } = useAlertStreamContext();

  const load = () => {
    setError(null);
    setStores(null);
    let cancelled = false;
    Promise.all([storesApi.list(), camerasApi.list()]).then(
      ([s, c]) => {
        if (cancelled) return;
        setStores(s);
        setCameras(c);
      },
      (e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Алдаа");
      },
    );
    return () => {
      cancelled = true;
    };
  };
  useEffect(() => load(), []);

  useEffect(() => {
    let cancelled = false;
    const f = () => {
      nodesApi.list().then((l) => !cancelled && setNodeList(l), () => {});
      ingestApi.paths().then(
        (r) => !cancelled && setIngest(r),
        () => !cancelled && setIngest(null),
      );
      eventsApi.list({ event_type: HEALTH_EVENTS, limit: 12 }).then(
        (e) => !cancelled && setEvents(e),
        () => {},
      );
    };
    f();
    const id = setInterval(f, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const liveCams = useMemo(
    () =>
      cameras
        .filter((c) => c.enabled && c.mediamtx_path)
        .map((c) => ({ id: c.id, path: c.mediamtx_path as string, name: c.name })),
    [cameras],
  );

  const rowsByPath = useMemo(() => {
    const rows = computeCameraRows(liveCams, {}, nodeList, ingest, alerts, now);
    return new Map(rows.map((r) => [r.cam.path, r]));
  }, [liveCams, nodeList, ingest, alerts, now]);

  // Heartbeat-sourced camera health (no WS on this page): worst of ingest + YOLO.
  const camStatus = (path: string | null): CellStatus => {
    if (!path) return "unknown";
    const row = rowsByPath.get(path);
    if (!row) return "unknown";
    return worstStatus([row.cells.ingest.status, row.cells.yolo.status]);
  };

  const counts = useMemo(() => {
    let flowing = 0;
    let stalled = 0;
    let downC = 0;
    for (const lc of liveCams) {
      const st = camStatus(lc.path);
      if (st === "ok") flowing += 1;
      else if (st === "warn") stalled += 1;
      else if (st === "down") downC += 1;
    }
    const nodesOnline = nodeList.filter((n) => n.is_online).length;
    const alerts15 = alerts.filter(
      (a) => now - new Date(a.created_at).getTime() < 15 * 60 * 1000,
    ).length;
    return { flowing, stalled, downC, nodesOnline, nodesTotal: nodeList.length, alerts15 };
  }, [liveCams, rowsByPath, nodeList, alerts, now]);

  if (error) {
    return (
      <div className="p-8">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }
  if (stores === null) {
    return (
      <div className="p-8">
        <Spinner label="Уншиж байна…" />
      </div>
    );
  }

  const enabledCams = cameras.filter((c) => c.enabled);

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <h1 className="text-lg font-medium">Эрүүл мэнд</h1>

      {/* Status counters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile
          label="Node онлайн"
          value={`${counts.nodesOnline}/${counts.nodesTotal}`}
          status={
            counts.nodesTotal === 0
              ? "unknown"
              : counts.nodesOnline === 0
                ? "down"
                : counts.nodesOnline < counts.nodesTotal
                  ? "warn"
                  : "ok"
          }
        />
        <Tile
          label="Камер урсаж"
          value={`${counts.flowing}/${liveCams.length}`}
          status={
            liveCams.length === 0
              ? "unknown"
              : counts.flowing === liveCams.length
                ? "ok"
                : counts.flowing === 0
                  ? "down"
                  : "warn"
          }
        />
        <Tile label="Кадргүй" value={String(counts.stalled)} status={counts.stalled > 0 ? "warn" : "ok"} />
        <Tile label="Тасарсан" value={String(counts.downC)} status={counts.downC > 0 ? "down" : "ok"} />
        <Tile label="Сэрэмжлүүлэг 15мин" value={String(counts.alerts15)} status="ok" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* Topology tree: store → camera */}
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-(--color-muted-foreground)">
            Дэлгүүр → Камер
          </h2>
          {enabledCams.length === 0 ? (
            <EmptyState icon={Cctv} title="Идэвхтэй камер алга" description="Камер бүртгэнэ үү." />
          ) : (
            <div className="space-y-3">
              {stores.map((store) => {
                const storeCams = enabledCams.filter((c) => c.store_id === store.id);
                if (storeCams.length === 0) return null;
                return (
                  <div
                    key={store.id}
                    className="rounded-(--radius) border border-(--color-border)"
                  >
                    <div className="border-b border-(--color-border) px-3 py-2 text-sm font-medium">
                      {store.name}
                    </div>
                    <ul>
                      {storeCams.map((c) => {
                        const st = camStatus(c.mediamtx_path ?? null);
                        const row = c.mediamtx_path ? rowsByPath.get(c.mediamtx_path) : undefined;
                        return (
                          <li
                            key={c.id}
                            className="flex items-center gap-2 border-b border-(--color-border) px-3 py-2 last:border-0"
                          >
                            <HealthDot status={st} />
                            <Link
                              href={
                                c.mediamtx_path
                                  ? `/pipeline/camera/${encodeURIComponent(c.mediamtx_path)}`
                                  : "/cameras"
                              }
                              className="text-sm text-(--color-foreground) hover:underline"
                            >
                              {c.name}
                            </Link>
                            <span className="ml-auto truncate text-right text-xs text-(--color-muted-foreground)">
                              {!c.mediamtx_path
                                ? "зам тохируулаагүй"
                                : (row?.cells.yolo.reason ?? row?.cells.ingest.reason ?? row?.cells.yolo.short ?? "—")}
                            </span>
                            {row?.node && (
                              <span className="hidden shrink-0 text-[10px] text-(--color-muted-foreground) sm:inline">
                                {row.node.name}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* AI nodes */}
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-(--color-muted-foreground)">
            AI node-ууд
          </h2>
          {nodeList.length === 0 ? (
            <p className="rounded-(--radius) border border-(--color-border) bg-(--color-surface) px-3 py-4 text-sm text-(--color-muted-foreground)">
              Энэ байгууллагын камер үйлчилж буй AI node алга.
            </p>
          ) : (
            <ul className="space-y-2">
              {nodeList.map((n) => (
                <NodeRow key={n.id} node={n} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Event activity strip */}
      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-(--color-muted-foreground)">
          Сүүлийн өөрчлөлтүүд
        </h2>
        {events.length === 0 ? (
          <p className="rounded-(--radius) border border-(--color-border) bg-(--color-surface) px-3 py-3 text-sm text-(--color-muted-foreground)">
            Сүүлийн үед эрүүл мэндийн өөрчлөлт алга.
          </p>
        ) : (
          <ul className="divide-y divide-(--color-border) rounded-(--radius) border border-(--color-border)">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="text-(--color-foreground)">
                  {EVENT_LABEL[e.event_type] ?? e.event_type}
                </span>
                <span className="truncate text-xs text-(--color-muted-foreground)">{e.message}</span>
                <span className="ml-auto shrink-0 text-xs text-(--color-muted-foreground)">
                  {relativeTime(e.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, status }: { label: string; value: string; status: CellStatus }) {
  return (
    <div className="rounded-(--radius) border border-(--color-border) bg-(--color-surface) px-3 py-2.5">
      <div className="text-[11px] text-(--color-muted-foreground)">{label}</div>
      <div className="mt-0.5 text-xl font-medium" style={{ color: STATUS_COLOR[status] }}>
        {value}
      </div>
    </div>
  );
}

function NodeRow({ node }: { node: OrgNodePublic }) {
  const vramPct =
    node.vram_used_mb != null && node.vram_total_mb
      ? Math.round((node.vram_used_mb / node.vram_total_mb) * 100)
      : null;
  return (
    <li>
      <Link
        href={`/health/node/${encodeURIComponent(node.id)}`}
        className="flex items-center gap-2 rounded-(--radius) border bg-(--color-surface) px-3 py-2.5 transition-colors hover:bg-(--color-muted)"
        style={{ borderColor: node.is_online ? "var(--color-border)" : "var(--color-danger)" }}
      >
        <HealthDot status={node.is_online ? "ok" : "down"} />
        <Cpu className="h-4 w-4 text-(--color-muted-foreground)" aria-hidden />
        <span className="text-sm text-(--color-foreground)">{node.name ?? "AI node"}</span>
        <span className="ml-auto text-xs text-(--color-muted-foreground)">
          {node.is_online
            ? `GPU ${node.gpu_pct ?? "—"}%${vramPct != null ? ` · VRAM ${vramPct}%` : ""}`
            : "офлайн"}
        </span>
        <ChevronRight className="h-4 w-4 text-(--color-muted-foreground)" aria-hidden />
      </Link>
    </li>
  );
}
