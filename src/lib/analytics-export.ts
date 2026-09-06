import { zoneLabel } from "@/lib/zone-overlay";
import type { StoreSystemHealth } from "@/lib/api";
import type {
  DemographicsSummary,
  PeakMatrix,
  RiskSummary,
  TrafficSummary,
  ZoneBreakdown,
  ZoneFlowSummary,
} from "@/lib/types";

/**
 * CSV export of the store analytics dashboard (docs/30). Everything the
 * dashboard already holds in memory is serialised client-side — no extra
 * backend round-trip, and the file matches exactly what the owner sees on
 * screen for the chosen window. Written for Excel: UTF-8 BOM so Cyrillic
 * opens correctly, CRLF line ends, RFC-4180 quoting.
 */

export type ExportDataset =
  | "all"
  | "traffic"
  | "zones"
  | "flow"
  | "demographics"
  | "peak"
  | "risk";

export const EXPORT_DATASETS: { key: ExportDataset; label: string }[] = [
  { key: "all", label: "Бүх өгөгдөл (нэг файл)" },
  { key: "traffic", label: "Цагийн зочид" },
  { key: "zones", label: "Бүсийн идэвх" },
  { key: "flow", label: "Хэрэглэгчийн урсгал" },
  { key: "demographics", label: "Хүйс, насны бүтэц" },
  { key: "peak", label: "Ачааллын хуваарь" },
  { key: "risk", label: "Эрсдэлийн үзэгдлүүд" },
];

export interface AnalyticsExportInput {
  storeName?: string;
  hours: number;
  /** Store-local timezone (from the peak matrix); hours are printed in it. */
  tz?: string;
  /** fixture id → display name (fixture-names.ts) so zones read like the UI. */
  names?: Map<string, string>;
  /** behaviour key → Mongolian label (/behaviors config). */
  behaviorLabels?: Record<string, string>;
  traffic: TrafficSummary | null;
  zones: ZoneBreakdown | null;
  flow: ZoneFlowSummary | null;
  demo: DemographicsSummary | null;
  peak: PeakMatrix | null;
  risk: RiskSummary | null;
  health: StoreSystemHealth | null;
}

type Row = (string | number | null | undefined)[];

const GENDER_LABEL: Record<string, string> = {
  male: "Эрэгтэй",
  female: "Эмэгтэй",
  unknown: "Тодорхойгүй",
};
const AGE_LABEL: Record<string, string> = {
  child: "Хүүхэд",
  youth: "Залуу",
  adult: "Насанд хүрэгч",
  senior: "Ахмад настан",
  unknown: "Тодорхойгүй",
};
const DOW = ["Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба", "Ням"];

function csvCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = typeof v === "number" ? String(v) : v;
  // Quote when the cell holds a delimiter, quote, or line break.
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(rows: Row[]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** «2026-09-06 14:00» in the store timezone (falls back to browser zone). */
function fmtHour(iso: string, tz?: string): string {
  const d = new Date(iso);
  try {
    // sv-SE yields an ISO-like «YYYY-MM-DD HH:MM» — locale-stable for Excel.
    return d
      .toLocaleString("sv-SE", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
      .replace("T", " ");
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

function fmtTs(iso: string, tz?: string): string {
  const d = new Date(iso);
  try {
    return d.toLocaleString("sv-SE", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return d.toISOString().replace("T", " ").slice(0, 19);
  }
}

function pct(share: number): string {
  return `${Math.round(share * 1000) / 10}%`;
}

function rangeLabel(hours: number): string {
  if (hours % 24 === 0 && hours > 24) return `${hours / 24} хоног`;
  return `${hours} цаг`;
}

// ── Section builders ─────────────────────────────────────────────────────────

function summarySection(i: AnalyticsExportInput): Row[] {
  const t = i.traffic;
  const topZone = i.zones?.zones?.[0];
  const topZoneName = topZone
    ? i.names?.get(topZone.fixture_id) || topZone.label || zoneLabel(topZone.type)
    : "";
  const rows: Row[] = [
    ["Тойм"],
    ["Үзүүлэлт", "Утга"],
    ["Дэлгүүр", i.storeName ?? ""],
    ["Хугацааны интервал", rangeLabel(i.hours)],
  ];
  if (t) {
    rows.push(
      ["Эхлэх", fmtTs(t.window_from, i.tz)],
      ["Дуусах", fmtTs(t.window_to, i.tz)],
      ["Нийт зочид", t.total],
      ["Өмнөх үеийн зочид", t.prev_total ?? ""],
      ["Ачаалалтай цаг", t.peak_hour ? fmtHour(t.peak_hour, i.tz) : ""],
      ["Ачаалалтай цагийн зочид", t.peak_entries],
      [
        "Дундаж зогсолт (сек)",
        t.avg_dwell_seconds != null ? Math.round(t.avg_dwell_seconds) : "",
      ],
      [
        "Өмнөх үеийн дундаж зогсолт (сек)",
        t.prev_avg_dwell_seconds != null ? Math.round(t.prev_avg_dwell_seconds) : "",
      ],
    );
  }
  rows.push(["Идэвхтэй бүс", topZoneName]);
  if (topZone) rows.push(["Идэвхтэй бүсийн хувь", pct(topZone.share)]);
  if (i.risk) {
    rows.push(
      ["Эрсдэлийн үзэгдэл", i.risk.total],
      ["Alert болсон", i.risk.alerted],
      ["Өмнөх үеийн эрсдэлийн үзэгдэл", i.risk.prev_total],
    );
  }
  if (i.tz) rows.push(["Цагийн бүс", i.tz]);
  return rows;
}

function trafficSection(i: AnalyticsExportInput): Row[] {
  const rows: Row[] = [["Цагийн зочид"], ["Цаг", "Зочид"]];
  for (const p of i.traffic?.series ?? []) rows.push([fmtHour(p.hour, i.tz), p.entries]);
  return rows;
}

function zonesSection(i: AnalyticsExportInput): Row[] {
  const rows: Row[] = [
    ["Бүсийн идэвх"],
    ["Бүс", "Төрөл", "Дээж (хүн·кадр)", "Хувь"],
  ];
  for (const z of i.zones?.zones ?? []) {
    rows.push([
      i.names?.get(z.fixture_id) || z.label || zoneLabel(z.type),
      zoneLabel(z.type),
      z.samples,
      pct(z.share),
    ]);
  }
  if (i.zones) rows.push(["Нийт", "", i.zones.total_samples, "100%"]);
  return rows;
}

function flowSection(i: AnalyticsExportInput): Row[] {
  const rows: Row[] = [
    ["Хэрэглэгчийн урсгал"],
    ["Хаанаас", "Хаашаа", "Шилжилт", "Эсрэг чиглэл"],
  ];
  const f = i.flow;
  if (!f) return rows;
  const byId = new Map(f.nodes.map((n) => [n.id, n]));
  const nameOf = (id: string) => {
    const n = byId.get(id);
    return n ? (i.names?.get(n.id) ?? n.label) : id;
  };
  const edges = [...f.edges].sort((a, b) => b.count - a.count);
  for (const e of edges) {
    rows.push([nameOf(e.from_id), nameOf(e.to_id), e.count, e.back_count ?? ""]);
  }
  rows.push([], ["Бүсийн орц/гарц"], ["Бүс", "Орсон", "Гарсан"]);
  for (const n of f.nodes) {
    rows.push([i.names?.get(n.id) ?? n.label, n.in_total ?? "", n.out_total ?? ""]);
  }
  return rows;
}

function demographicsSection(i: AnalyticsExportInput): Row[] {
  const rows: Row[] = [["Хүйс, насны бүтэц"], ["Ангилал", "Утга", "Тоо", "Хувь"]];
  const d = i.demo;
  if (!d) return rows;
  for (const g of d.gender ?? [])
    rows.push(["Хүйс", GENDER_LABEL[g.key] ?? g.key, g.count, pct(g.share)]);
  for (const a of d.age ?? [])
    rows.push(["Нас", AGE_LABEL[a.key] ?? a.key, a.count, pct(a.share)]);
  rows.push(["Нийт", "", d.total, "100%"]);
  return rows;
}

function peakSection(i: AnalyticsExportInput): Row[] {
  const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
  const rows: Row[] = [["Ачааллын хуваарь (7 хоног × цаг, сүүлийн 28 хоног)"], ["Өдөр", ...hours]];
  const p = i.peak;
  if (!p) return rows;
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const c of p.cells ?? []) {
    const row = grid[c.dow - 1];
    if (row && c.hour >= 0 && c.hour < 24) row[c.hour] = (row[c.hour] ?? 0) + c.entries;
  }
  grid.forEach((r, idx) => rows.push([DOW[idx], ...r]));
  return rows;
}

function riskSection(i: AnalyticsExportInput): Row[] {
  const r = i.risk;
  const label = (k: string) => i.behaviorLabels?.[k] ?? k;
  const rows: Row[] = [
    ["Эрсдэлийн үзэгдлүүд"],
    ["Цаг", "Камер", "Оргил эрсдэл %", "Түвшин", "Зан үйл", "Alert", "Үргэлжлэх (сек)"],
  ];
  if (!r) return rows;
  for (const e of r.recent) {
    rows.push([
      fmtTs(e.ts, i.tz),
      e.camera_name,
      Math.round(e.peak_risk_pct),
      e.level,
      e.behaviors.map(label).join("; "),
      e.alerted ? "Тийм" : "Үгүй",
      Math.round(e.duration_sec),
    ]);
  }
  rows.push([], ["Хамгийн их илэрсэн зан үйл"], ["Зан үйл", "Тоо", "Хувь"]);
  for (const b of r.top_behaviors) rows.push([label(b.key), b.count, pct(b.share)]);
  rows.push([], ["Камер тус бүрийн үзэгдэл"], ["Камер", "Тоо", "Хувь"]);
  for (const c of r.top_cameras) rows.push([c.key, c.count, pct(c.share)]);
  return rows;
}

function healthSection(i: AnalyticsExportInput): Row[] {
  const h = i.health;
  const rows: Row[] = [["Системийн чанар"], ["Үзүүлэлт", "Утга"]];
  if (!h) return rows;
  rows.push(
    ["Идэвхтэй камер", h.cameras.total_enabled],
    ["Онлайн камер", h.cameras.online],
    ["Оффлайн камер", h.cameras.offline],
    [
      "Камерын хүртээмж",
      h.cameras.availability_pct != null ? `${Math.round(h.cameras.availability_pct)}%` : "",
    ],
    ["Нийт alert", h.quality.total_alerts],
    ["Үнэлэгдсэн alert", h.quality.labeled],
    ["Зөв (TP)", h.quality.tp],
    ["Буруу (FP)", h.quality.fp],
    ["Тодорхойгүй", h.quality.unclear],
    ["Нарийвчлал", h.quality.precision != null ? pct(h.quality.precision) : ""],
    ["Буруу сэрэмжлүүлгийн хувь", h.quality.fp_rate != null ? pct(h.quality.fp_rate) : ""],
    [
      "Хариу үйлдлийн медиан (мин)",
      h.response_time.median_min != null ? Math.round(h.response_time.median_min) : "",
    ],
  );
  return rows;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Build the CSV body (no BOM) for one dataset or the whole dashboard. */
export function buildAnalyticsCsv(
  dataset: ExportDataset,
  input: AnalyticsExportInput,
): string {
  const builders: Record<Exclude<ExportDataset, "all">, (i: AnalyticsExportInput) => Row[]> = {
    traffic: trafficSection,
    zones: zonesSection,
    flow: flowSection,
    demographics: demographicsSection,
    peak: peakSection,
    risk: riskSection,
  };
  if (dataset !== "all") return rowsToCsv(builders[dataset](input));

  const sections: Row[][] = [
    summarySection(input),
    trafficSection(input),
    zonesSection(input),
    flowSection(input),
    demographicsSection(input),
    peakSection(input),
    riskSection(input),
    healthSection(input),
  ];
  // One blank line between sections so Excel shows them as separate blocks.
  const rows: Row[] = [];
  sections.forEach((s, idx) => {
    if (idx > 0) rows.push([]);
    rows.push(...s);
  });
  return rowsToCsv(rows);
}

/** «analitik_<store>_<7-honog>_2026-09-06.csv» — filesystem-safe. */
export function analyticsFileName(
  dataset: ExportDataset,
  storeName: string | undefined,
  hours: number,
): string {
  const safe = (s: string) =>
    s
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 40);
  const parts = ["analitik"];
  if (storeName) parts.push(safe(storeName));
  if (dataset !== "all") parts.push(dataset);
  parts.push(hours % 24 === 0 ? `${hours / 24}d` : `${hours}h`);
  parts.push(new Date().toISOString().slice(0, 10));
  return `${parts.join("_")}.csv`;
}

/** Trigger a browser download of `csv` as `filename` (UTF-8 with BOM). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
