"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
} from "@chipmo-sentry/ui-kit";
import { Brain, CheckCircle2, Clock, Save } from "lucide-react";
import { useEffect, useState } from "react";

type BehaviorDimension = {
  key: string;
  label_mn: string;
  description_mn: string;
  weight: number;
  active_in_m1: boolean;
  why_deferred: string | null;
};

type BehaviorConfig = {
  dimensions: BehaviorDimension[];
  thresholds: { green_max: number; yellow_max: number };
  color_labels: { green: string; yellow: string; red: string };
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function BehaviorsPage() {
  const [data, setData] = useState<BehaviorConfig | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Editable state mirrors data; reset on data refresh
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [greenMax, setGreenMax] = useState<number>(5);
  const [yellowMax, setYellowMax] = useState<number>(15);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const reload = () =>
    fetch(`${API_BASE}/api/v1/behaviors`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as BehaviorConfig;
      })
      .then((j) => {
        setData(j);
        setWeights(
          Object.fromEntries(j.dimensions.map((d) => [d.key, d.weight])),
        );
        setGreenMax(j.thresholds.green_max);
        setYellowMax(j.thresholds.yellow_max);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Алдаа"));

  useEffect(() => {
    reload();
  }, []);

  const dirty = data
    ? data.dimensions.some((d) => weights[d.key] !== d.weight) ||
      greenMax !== data.thresholds.green_max ||
      yellowMax !== data.thresholds.yellow_max
    : false;

  const thresholdValid = greenMax >= 0 && yellowMax > greenMax;

  async function save() {
    if (!dirty || !thresholdValid) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/api/v1/behaviors`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weights,
          thresholds: { green_max: greenMax, yellow_max: yellowMax },
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      const fresh = (await r.json()) as BehaviorConfig;
      setData(fresh);
      setSavedAt(new Date().toLocaleTimeString("mn-MN"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Хадгалах амжилтгүй");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    if (!data) return;
    setWeights(
      Object.fromEntries(data.dimensions.map((d) => [d.key, d.weight])),
    );
    setGreenMax(data.thresholds.green_max);
    setYellowMax(data.thresholds.yellow_max);
  }

  if (err) return <p className="p-8 text-[var(--color-danger)]">{err}</p>;
  if (!data) {
    return (
      <div className="p-8">
        <Spinner />
      </div>
    );
  }

  const activeCount = data.dimensions.filter((d) => d.active_in_m1).length;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Brain className="h-6 w-6 text-[var(--color-primary)]" />
            <h1 className="text-2xl font-semibold">Сэжиг шалгуурууд</h1>
          </div>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            AI {activeCount} / {data.dimensions.length} хэмжээсээр хүн бүрийн
            үйлдлийг сканнердан, нийлбэр оноогоор өнгөт бүсэд хувааж дохио
            өгнө. <strong>Оноо нь хувь биш — гүйцэтгэл бүрд жин нэмэгдэнэ.</strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && !dirty && (
            <span className="text-xs text-[var(--color-success)]">
              Хадгалагдсан · {savedAt}
            </span>
          )}
          {dirty && (
            <Button
              variant="outline"
              size="sm"
              onClick={reset}
              disabled={saving}
            >
              Буцаах
            </Button>
          )}
          <Button
            size="sm"
            onClick={save}
            disabled={!dirty || !thresholdValid || saving}
            title={
              !thresholdValid
                ? "Анхаар оноо нь хэвийн оноогоос их байх ёстой"
                : undefined
            }
          >
            <Save className="h-4 w-4" />
            {saving ? "Хадгалж байна..." : "Хадгалах"}
          </Button>
        </div>
      </div>

      {/* Threshold settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Risk түвшний босго (оноо)</CardTitle>
          <CardDescription>
            Хүний нийт оноо энэ босгуудаас хамаарч өнгө сонгогдоно. Жишээ нь
            "анхаар"-ыг 10 болгоход 10-аас дээш оноотой хэн бүхэн шар болно.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <ThresholdInput
              color="green"
              label={data.color_labels.green}
              hint={`оноо < ${greenMax}`}
              value={greenMax}
              max={yellowMax - 0.1}
              onChange={setGreenMax}
            />
            <ThresholdInput
              color="yellow"
              label={data.color_labels.yellow}
              hint={`${greenMax} ≤ оноо < ${yellowMax}`}
              value={yellowMax}
              min={greenMax + 0.1}
              onChange={setYellowMax}
            />
            <div className="rounded-md border border-[var(--color-border)] p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
                <span className="text-sm font-medium">{data.color_labels.red}</span>
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                оноо ≥ {yellowMax}
              </p>
              <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                Энэ үед автомат clip хадгалагдан alert үүснэ.
              </p>
            </div>
          </div>
          {!thresholdValid && (
            <p className="mt-3 text-xs text-[var(--color-danger)]">
              "Анхаар"-ын босго "Хэвийн"-ийн босгоноос их байх ёстой.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Dimensions table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">6 шалгуур — жин (оноо)</CardTitle>
          <CardDescription>
            Шалгуур триггерлэгдэх бүрд тус жин нь хүний нийт оноонд нэмэгдэнэ.
            Жин ↑ = шалгуур илүү мэдрэмжтэй.
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
                    {d.why_deferred && (
                      <div className="mt-1 text-[var(--color-warning)]">
                        <strong>Хүлээгдэж:</strong> {d.why_deferred}
                      </div>
                    )}
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
                  <td className="px-3 py-3 align-top text-right">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={weights[d.key] ?? d.weight}
                      onChange={(e) =>
                        setWeights((prev) => ({
                          ...prev,
                          [d.key]: Number(e.target.value) || 0,
                        }))
                      }
                      className="w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-right font-mono text-sm focus:border-[var(--color-ring)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/30"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-[var(--color-muted-foreground)]">
        Тохиргоо хадгалагдсаны дараа sentry-ai ~30 секунд дотор шинэ
        утгуудыг хүлээн авч хэрэглэж эхэлнэ.
      </p>
    </div>
  );
}

function ThresholdInput({
  color,
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  color: "green" | "yellow";
  label: string;
  hint: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  const dotColor = color === "green" ? "bg-green-500" : "bg-yellow-500";
  return (
    <div className="rounded-md border border-[var(--color-border)] p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotColor}`} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-xs text-[var(--color-muted-foreground)]">{hint}</p>
      <div className="mt-2 flex items-center gap-1">
        <span className="text-xs text-[var(--color-muted-foreground)]">
          Босго ≥
        </span>
        <input
          type="number"
          step="0.5"
          min={min ?? 0}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 font-mono text-sm focus:border-[var(--color-ring)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/30"
        />
      </div>
    </div>
  );
}
