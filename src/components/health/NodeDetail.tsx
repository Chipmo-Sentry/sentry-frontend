"use client";

import { Spinner } from "@chipmo-sentry/ui-kit";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { HealthDot } from "@/components/pipeline/ui";
import {
  nodes as nodesApi,
  type NodeMetricRange,
  type NodeMetricSample,
  type OrgNodePublic,
} from "@/lib/api";
import { relativeTime } from "@/lib/time";

const RANGES: NodeMetricRange[] = ["1h", "6h", "24h", "7d"];
const STARVE_SEC = 20;

export function NodeDetail({ nodeId }: { nodeId: string }) {
  const [node, setNode] = useState<OrgNodePublic | null | undefined>(undefined);
  const [range, setRange] = useState<NodeMetricRange>("24h");
  const [samples, setSamples] = useState<NodeMetricSample[]>([]);

  // Current state: re-poll the node list every 10s and pick this node.
  useEffect(() => {
    let cancelled = false;
    const f = () =>
      nodesApi.list().then(
        (list) => {
          if (!cancelled) setNode(list.find((n) => n.id === nodeId) ?? null);
        },
        () => {
          if (!cancelled) setNode((p) => p ?? null);
        },
      );
    f();
    const id = setInterval(f, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [nodeId]);

  // History for the selected range.
  useEffect(() => {
    let cancelled = false;
    nodesApi.metrics(nodeId, range).then(
      (s) => !cancelled && setSamples(s),
      () => !cancelled && setSamples([]),
    );
    return () => {
      cancelled = true;
    };
  }, [nodeId, range]);

  const starved = useMemo(() => {
    if (!node || node.provider_ready === false) return false;
    const ago = node.vlm_activity?.last_ago_sec;
    return ago != null && ago > STARVE_SEC;
  }, [node]);

  if (node === undefined) {
    return (
      <div className="p-8">
        <Spinner label="Уншиж байна…" />
      </div>
    );
  }
  if (node === null) {
    return (
      <div className="p-8 text-sm text-[var(--color-muted-foreground)]">
        <Link href="/health" className="inline-flex items-center gap-1 hover:text-[var(--color-foreground)]">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Эрүүл мэнд
        </Link>
        <p className="mt-4">Энэ node олдсонгүй эсвэл таны байгууллагынх биш байна.</p>
      </div>
    );
  }

  const applied = node.provider_effective === node.provider;
  const providerOk = node.provider_ready !== false;
  const vramPct =
    node.vram_used_mb != null && node.vram_total_mb
      ? Math.round((node.vram_used_mb / node.vram_total_mb) * 100)
      : null;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/health"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Эрүүл мэнд
        </Link>
        <span className="text-[var(--color-muted-foreground)]">/</span>
        <HealthDot status={node.is_online ? "ok" : "down"} />
        <h1 className="text-lg font-medium">{node.name ?? "AI node"}</h1>
        <span className="text-xs text-[var(--color-muted-foreground)]">
          {node.is_online ? "онлайн" : "офлайн"}
          {node.last_seen_at ? ` · ${relativeTime(node.last_seen_at)}` : ""}
          {node.version ? ` · v${node.version}` : ""}
          {node.gpu ? ` · ${node.gpu}` : ""}
        </span>
      </div>

      {/* Provider + breach state */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge
          text={`Провайдер: ${node.provider}${node.provider_effective && node.provider_effective !== node.provider ? ` → ${node.provider_effective}` : ""} ${providerOk ? (applied ? "✓" : "⏳") : "⚠"}`}
          color={providerOk ? (applied ? "var(--color-success)" : "var(--color-warning)") : "var(--color-danger)"}
        />
        <Badge
          text={`Горим: ${node.breach_mode_effective ?? node.breach_mode}`}
          color={node.breach_mode_effective === "off" ? "var(--color-warning)" : "var(--color-muted-foreground)"}
        />
      </div>
      {node.provider_error && (
        <p className="text-xs text-[var(--color-danger)]">{node.provider_error}</p>
      )}

      {starved && (
        <div
          className="flex items-center gap-2 rounded-[var(--radius)] border px-3 py-2 text-sm"
          style={{ borderColor: "var(--color-warning)", color: "var(--color-warning)" }}
        >
          <AlertTriangle className="h-4 w-4" aria-hidden />
          GPU дүүрсэн — VLM шалгалт {node.vlm_activity?.last_ago_sec}с зогссон
        </div>
      )}

      {/* Current gauges */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="GPU" value={node.gpu_pct != null ? `${node.gpu_pct}%` : "—"} />
        <Stat label="VRAM" value={vramPct != null ? `${vramPct}%` : "—"} />
        <Stat label="CPU" value={node.cpu_pct != null ? `${Math.round(node.cpu_pct)}%` : "—"} />
        <Stat
          label="RAM"
          value={
            node.ram_used_mb != null && node.ram_total_mb
              ? `${(node.ram_used_mb / 1024).toFixed(1)}GB`
              : "—"
          }
        />
        <Stat label="FPS" value={node.fps_inference != null ? node.fps_inference.toFixed(1) : "—"} />
        <Stat label="Темп" value={node.gpu_temp_c != null ? `${node.gpu_temp_c}°` : "—"} />
      </div>

      {/* History */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Түүх
          </h2>
          <div className="ml-auto flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded-[var(--radius)] px-2 py-1 text-xs transition-colors ${
                  r === range
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        {samples.length < 2 ? (
          <p className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-6 text-center text-sm text-[var(--color-muted-foreground)]">
            Энэ хугацаанд хангалттай өгөгдөл алга.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartCard
              title="GPU / VRAM / CPU (%)"
              samples={samples}
              yMax={100}
              series={[
                { key: "gpu_pct", label: "GPU", color: "#2563eb" },
                { key: "cpu_pct", label: "CPU", color: "#f59e0b" },
                { key: "vramPct", label: "VRAM", color: "#22c55e" },
              ]}
            />
            <ChartCard
              title="FPS (инференц)"
              samples={samples}
              series={[{ key: "fps_inference", label: "FPS", color: "#2563eb" }]}
            />
          </div>
        )}
      </section>

      {/* This node's cameras */}
      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
          Энэ node-ийн камерууд
        </h2>
        {node.cameras.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">Камер тайлагнаагүй.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {node.cameras.map((c) => (
              <li key={c.camera_id} className="flex items-center gap-2">
                <HealthDot status={c.status === "ok" ? "ok" : c.status === "stalled" ? "warn" : "down"} />
                <Link
                  href={`/pipeline/camera/${encodeURIComponent(c.camera_id)}`}
                  className="text-[var(--color-foreground)] hover:underline"
                >
                  {c.camera_id}
                </Link>
                <span className="ml-auto text-xs text-[var(--color-muted-foreground)]">
                  {c.fps != null ? `${c.fps.toFixed(1)} fps` : "—"} ·{" "}
                  {c.status === "ok" ? "инференц" : c.status === "stalled" ? "кадргүй" : "алдаа"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="rounded-[var(--radius)] px-2 py-1"
      style={{ color, background: "color-mix(in srgb, " + color + " 14%, transparent)" }}
    >
      {text}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
      <div className="text-[11px] text-[var(--color-muted-foreground)]">{label}</div>
      <div className="text-base text-[var(--color-foreground)]">{value}</div>
    </div>
  );
}

type SeriesDef = { key: string; label: string; color: string };

function ChartCard({
  title,
  samples,
  series,
  yMax,
}: {
  title: string;
  samples: NodeMetricSample[];
  series: SeriesDef[];
  yMax?: number;
}) {
  const W = 320;
  const H = 110;
  const pad = 4;

  // Derive a vramPct field on the fly so it can be charted alongside the rest.
  const vals = (key: string) =>
    samples.map((s) => {
      if (key === "vramPct") {
        return s.vram_used_mb != null && s.vram_total_mb
          ? (s.vram_used_mb / s.vram_total_mb) * 100
          : null;
      }
      return (s as unknown as Record<string, number | null>)[key];
    });

  const max =
    yMax ??
    Math.max(
      1,
      ...series.flatMap((sd) => vals(sd.key).map((v) => (v == null ? 0 : v))),
    );

  const x = (i: number) => pad + (i / Math.max(1, samples.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad);

  return (
    <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="mb-2 flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
        <span>{title}</span>
        <span className="ml-auto flex gap-2">
          {series.map((sd) => (
            <span key={sd.key} className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: sd.color }} />
              {sd.label}
            </span>
          ))}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-28 w-full" role="img">
        {series.map((sd) => {
          const pts = vals(sd.key)
            .map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
            .filter(Boolean)
            .join(" ");
          return (
            <polyline
              key={sd.key}
              points={pts}
              fill="none"
              stroke={sd.color}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
    </div>
  );
}
