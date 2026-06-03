"use client";

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
} from "@chipmo-sentry/ui-kit";
import { Brain, CheckCircle2, Clock, Lock } from "lucide-react";
import { useEffect, useState } from "react";

import { behaviors } from "@/lib/api";
import type { BehaviorConfig } from "@/lib/types";

const COLOR_LABEL_FALLBACK = {
  green: "Хэвийн",
  yellow: "Анхаар",
  red: "Сэжигтэй",
};

/**
 * READ-ONLY view of the global behavior config. Editing lives in the
 * super-admin panel (sentry-superadmin) — the backend PATCH /behaviors is
 * super-admin only. Organization admins can only view here.
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
          // Only surface an error before the first successful load; keep
          // showing the last good config on a transient poll failure.
          if (!cancelled && !loaded)
            setErr(e instanceof Error ? e.message : "Алдаа");
        },
      );
    }
    load();
    // Poll so a super-admin's threshold/weight change shows here within ~30s
    // without the operator refreshing the page.
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (err) return <p className="p-8 text-[var(--color-danger)]">{err}</p>;
  if (!data) {
    return (
      <div className="p-8">
        <Spinner />
      </div>
    );
  }

  const greenMax = data.thresholds.green_max ?? 5;
  const yellowMax = data.thresholds.yellow_max ?? 15;
  const activeCount = data.dimensions.filter((d) => d.active_in_m1).length;

  return (
    <div className="p-8">
      <div className="mb-2 flex items-center gap-2">
        <Brain className="h-6 w-6 text-[var(--color-primary)]" />
        <h1 className="text-2xl font-semibold">Сэжиг шалгуурууд</h1>
      </div>
      <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
        AI {activeCount} / {data.dimensions.length} хэмжээсээр хүн бүрийн үйлдлийг
        сканнердан, нийлбэр оноогоор өнгөт бүсэд хувааж дохио өгнө.{" "}
        <strong>Оноо нь хувь биш — гүйцэтгэл бүрд жин нэмэгдэнэ.</strong>
      </p>

      <div className="mb-6 flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        Зөвхөн харах. Жин болон босгыг <strong>супер админ</strong> удирдлагын
        самбараас тохируулна.
      </div>

      {/* Risk thresholds */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Risk түвшний босго (оноо)</CardTitle>
          <CardDescription>
            Хүний нийт оноо энэ босгуудаас хамаарч өнгө сонгогдоно.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 text-sm">
            <Band
              color="bg-green-500"
              label={data.color_labels?.green ?? COLOR_LABEL_FALLBACK.green}
              range={`< ${greenMax}`}
            />
            <Band
              color="bg-yellow-500"
              label={data.color_labels?.yellow ?? COLOR_LABEL_FALLBACK.yellow}
              range={`${greenMax} – ${yellowMax}`}
            />
            <Band
              color="bg-red-500"
              label={data.color_labels?.red ?? COLOR_LABEL_FALLBACK.red}
              range={`≥ ${yellowMax}`}
            />
          </div>
          <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
            🔴 Сэжигтэй (≥ {yellowMax}) болоход автомат clip хадгалагдан alert
            үүснэ.
          </p>
        </CardContent>
      </Card>

      {/* Dimensions table (read-only) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">6 шалгуур — жин (оноо)</CardTitle>
          <CardDescription>
            Шалгуур триггерлэгдэх бүрд тус жин нь хүний нийт оноонд нэмэгдэнэ.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pt-0">
          <table className="w-full text-sm">
            <thead className="border-y border-[var(--color-border)] bg-[var(--color-muted)] text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">Шалгуур</th>
                <th className="px-3 py-2 text-left font-medium">Тайлбар</th>
                <th className="px-3 py-2 text-center font-medium">Төлөв</th>
                <th className="px-3 py-2 text-right font-medium">Жин (оноо)</th>
              </tr>
            </thead>
            <tbody>
              {data.dimensions.map((d, idx) => (
                <tr
                  key={d.key}
                  className={`border-b border-[var(--color-border)] ${
                    !d.active_in_m1 ? "opacity-60" : ""
                  }`}
                >
                  <td className="px-3 py-3 align-top text-xs text-[var(--color-muted-foreground)]">
                    {idx + 1}
                  </td>
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
                    {d.active_in_m1 ? (
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
