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
import { Brain, CheckCircle2, Clock } from "lucide-react";
import { useEffect, useState } from "react";

type BehaviorDimension = {
  key: string;
  label_mn: string;
  description_mn: string;
  default_weight: number;
  active_in_m1: boolean;
  why_deferred: string | null;
};

type BehaviorResponse = {
  dimensions: BehaviorDimension[];
  active_count: number;
  total_count: number;
  risk_thresholds: { green_max: number; yellow_max: number };
  color_bands: Record<"green" | "yellow" | "red", string>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function BehaviorsPage() {
  const [data, setData] = useState<BehaviorResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/v1/behaviors`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (!cancelled) setData(j as BehaviorResponse);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Алдаа");
      });
    return () => {
      cancelled = true;
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

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <Brain className="h-6 w-6 text-[var(--color-primary)]" />
          <h1 className="text-2xl font-semibold">Сэжиг шалгуурууд</h1>
        </div>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          AI {data.active_count} / {data.total_count} хэмжээсээр хүн бүрийн
          үйлдлийг сканнердан, нийлбэр risk_pct (0–100%) тооцон гаргана.
        </p>
      </div>

      {/* Risk color legend */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Risk түвшингийн өнгө</CardTitle>
          <CardDescription>
            Тооцоологдсон risk утга нь bounding box-н өнгийг тогтооно
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-green-500" />
              <span className="text-sm">
                <span className="font-medium">Хэвийн</span>{" "}
                <span className="text-[var(--color-muted-foreground)]">
                  ({data.color_bands.green})
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-yellow-500" />
              <span className="text-sm">
                <span className="font-medium">Анхаар</span>{" "}
                <span className="text-[var(--color-muted-foreground)]">
                  ({data.color_bands.yellow})
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
              <span className="text-sm">
                <span className="font-medium">Сэжигтэй</span>{" "}
                <span className="text-[var(--color-muted-foreground)]">
                  ({data.color_bands.red})
                </span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 6 dimensions */}
      <div className="space-y-3">
        {data.dimensions.map((d, idx) => (
          <Card key={d.key}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-muted)] text-xs font-semibold text-[var(--color-muted-foreground)]">
                    {idx + 1}
                  </span>
                  <CardTitle className="text-base">{d.label_mn}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">
                    Жин: <span className="font-mono">{d.default_weight}</span>
                  </Badge>
                  {d.active_in_m1 ? (
                    <Badge tone="success">
                      <CheckCircle2 className="h-3 w-3" /> Идэвхтэй
                    </Badge>
                  ) : (
                    <Badge tone="warning">
                      <Clock className="h-3 w-3" /> Хүлээгдэж байгаа
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{d.description_mn}</p>
              {d.why_deferred && (
                <p className="mt-2 rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">
                  <strong>Хүлээгдэж байгаа шалтгаан:</strong> {d.why_deferred}
                </p>
              )}
              <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                Техник нэр:{" "}
                <code className="rounded bg-[var(--color-muted)] px-1.5 py-0.5 font-mono">
                  {d.key}
                </code>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-xs text-[var(--color-muted-foreground)]">
        M2-д камер бүрд жин ба threshold-ийг гараар тохируулдаг slider UI
        нэмэгдэнэ.
      </p>
    </div>
  );
}
