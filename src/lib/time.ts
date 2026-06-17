/** Mongolian relative-time formatting for alert timestamps. */

const ABS_FORMAT = new Intl.DateTimeFormat("mn-MN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** "Дөнгөж сая", "5 минутын өмнө", "3 цагийн өмнө", else absolute date. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffSec = Math.round((now - then) / 1000);

  if (diffSec < 0) return "Дөнгөж сая";
  if (diffSec < 10) return "Дөнгөж сая";
  if (diffSec < 60) return `${diffSec} секундын өмнө`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} минутын өмнө`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} цагийн өмнө`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} өдрийн өмнө`;

  return ABS_FORMAT.format(then);
}

/** Full absolute timestamp for tooltips/detail views. */
export function absoluteTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  return ABS_FORMAT.format(t);
}

const p2 = (n: number) => String(n).padStart(2, "0");
const p3 = (n: number) => String(n).padStart(3, "0");

/** Clock with millisecond precision for the activity log: "14:30:22.640".
 * Local time. The event-log requirement asks for HH:MM:SS.ms explicitly. */
export function clockMs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.${p3(
    d.getMilliseconds(),
  )}`;
}

/** "16:25:02" local wall-clock to the second (no millis), for table rows. */
export function clock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

/** "2026-06-15" local date, for grouping log rows by day. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
