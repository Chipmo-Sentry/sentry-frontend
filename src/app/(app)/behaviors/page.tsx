"use client";

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  Spinner,
} from "@chipmo-sentry/ui-kit";
import { Brain, CheckCircle2, Clock, ListOrdered, Lock } from "lucide-react";
import { useEffect, useState } from "react";

import { behaviors } from "@/lib/api";
import type { BehaviorConfig } from "@/lib/types";

const LEVEL_LABEL_FALLBACK = {
  LOW: "Бага",
  MEDIUM: "Дунд",
  HIGH: "Өндөр",
  CRITICAL: "Ноцтой",
} as const;

const LEVELS: { n: number; title: string }[] = [
  { n: 1, title: "Түвшин 1 — Сэжигтэй зан" },
  { n: 2, title: "Түвшин 2 — Нуун далдлах" },
  { n: 3, title: "Түвшин 3 — Зохион байгуулалттай" },
  { n: 4, title: "Түвшин 4 — Ноцтой үйлдэл" },
];

/**
 * READ-ONLY view of the global behavior config (Engine v2). Editing lives in the
 * super-admin panel — the backend PATCH /behaviors is super-admin only.
 */
export default function BehaviorsPage() {
  const [data, setData] = useState<BehaviorConfig | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loaded = false;
    function load() {
      behaviors.get().then(
        (j) => {
          if (cancelled) return;
          loaded = true;
          setData(j);
        },
        (e) => {
          if (!cancelled && !loaded)
            setErr(e instanceof Error ? e.message : "Алдаа");
        },
      );
    }
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (err) {
    return (
      <div className="p-8">
        <ErrorState message={err} onRetry={() => window.location.reload()} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-8">
        <Spinner />
      </div>
    );
  }

  const greenMax = data.thresholds.green_max ?? 10;
  const yellowMax = data.thresholds.yellow_max ?? 25;
  const highMax = data.thresholds.high_max ?? 50;
  const detectorCount = data.dimensions.filter((d) => d.has_detector).length;
  const lbl = (k: keyof typeof LEVEL_LABEL_FALLBACK) =>
    data.level_labels?.[k] ?? LEVEL_LABEL_FALLBACK[k];
  const ll = {
    LOW: lbl("LOW"),
    MEDIUM: lbl("MEDIUM"),
    HIGH: lbl("HIGH"),
    CRITICAL: lbl("CRITICAL"),
  };

  return (
    <div className="p-8">
      <div className="mb-2 flex items-center gap-2">
        <Brain className="h-6 w-6 text-[var(--color-primary)]" />
        <h1 className="text-2xl font-semibold">Зан үйлийн engine</h1>
      </div>
      <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
        AI {detectorCount} / {data.dimensions.length} детектортой шалгуураар хүн
        бүрийн үйлдлийг 0–100 эрсдэлийн оноогоор үнэлж, дараалал илрэхэд нэмэлт
        оноо өгнө.
      </p>

      <div className="mb-6 flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        Зөвхөн харах. Жин болон босгыг <strong>супер админ</strong> удирдлагын
        самбараас тохируулна.
      </div>

      {/* 4-level thresholds */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">
            Эрсдэлийн түвшин (оноо 0–100)
          </CardTitle>
          <CardDescription>
            Хүний нийт оноо энэ босгуудаар 4 түвшинд хуваагдана.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 text-sm">
            <Band color="bg-green-500" label={ll.LOW} range={`< ${greenMax}`} />
            <Band
              color="bg-yellow-500"
              label={ll.MEDIUM}
              range={`${greenMax} – ${yellowMax}`}
            />
            <Band
              color="bg-orange-500"
              label={ll.HIGH}
              range={`${yellowMax} – ${highMax}`}
            />
            <Band color="bg-red-600" label={ll.CRITICAL} range={`≥ ${highMax}`} />
          </div>
          <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
            🔴 {ll.CRITICAL} (≥ {highMax}) болоход автомат clip хадгалагдан VLM
            шалгаад alert үүснэ.
          </p>
        </CardContent>
      </Card>

      {/* Criteria grouped by level (read-only) */}
      {LEVELS.map((lvl) => {
        const dims = data.dimensions.filter((d) => (d.level ?? 1) === lvl.n);
        if (dims.length === 0) return null;
        return (
          <Card key={lvl.n} className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">{lvl.title}</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pt-0">
              <table className="w-full text-sm">
                <thead className="border-y border-[var(--color-border)] bg-[var(--color-muted)] text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Шалгуур</th>
                    <th className="px-3 py-2 text-left font-medium">Тайлбар</th>
                    <th className="px-3 py-2 text-center font-medium">Төлөв</th>
                    <th className="px-3 py-2 text-right font-medium">Жин</th>
                  </tr>
                </thead>
                <tbody>
                  {dims.map((d) => (
                    <tr
                      key={d.key}
                      className={`border-b border-[var(--color-border)] ${
                        !d.active ? "opacity-60" : ""
                      }`}
                    >
                      <td className="px-3 py-3 align-top">
                        <div className="font-medium">{d.label_mn}</div>
                        <code className="mt-0.5 inline-block rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-xs">
                          {d.key}
                        </code>
                      </td>
                      <td className="max-w-md px-3 py-3 align-top text-xs text-[var(--color-muted-foreground)]">
                        {d.description_mn}
                      </td>
                      <td className="px-3 py-3 align-top text-center">
                        {d.has_detector && d.active ? (
                          <Badge tone="success">
                            <CheckCircle2 className="h-3 w-3" /> Идэвхтэй
                          </Badge>
                        ) : (
                          <Badge tone="warning">
                            <Clock className="h-3 w-3" /> Хүлээгдэж
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top text-right font-mono">
                        {d.weight}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}

      {/* Sequence rules (read-only) */}
      {data.sequences && data.sequences.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListOrdered className="h-4 w-4" />
              Дарааллын дүрэм
            </CardTitle>
            <CardDescription>
              Зан үйлүүд эдгээр дарааллаар илрэхэд нэмэлт оноо нэмэгдэнэ.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.sequences.map((s) => (
                <li
                  key={s.key}
                  className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] px-3 py-2"
                >
                  <span className="flex flex-wrap items-center gap-1.5 text-sm">
                    {s.pattern.map((p, i) => (
                      <span key={i} className="flex items-center gap-1.5">
                        {i > 0 && (
                          <span className="text-[var(--color-muted-foreground)]">
                            →
                          </span>
                        )}
                        <code className="rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-xs">
                          {p}
                        </code>
                      </span>
                    ))}
                  </span>
                  <Badge tone="success">+{s.bonus}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Band({
  color,
  label,
  range,
}: {
  color: string;
  label: string;
  range: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-3 w-3 rounded-full ${color}`} />
      <span>
        <span className="font-medium">{label}</span>{" "}
        <span className="font-mono text-[var(--color-muted-foreground)]">
          ({range})
        </span>
      </span>
    </div>
  );
}
