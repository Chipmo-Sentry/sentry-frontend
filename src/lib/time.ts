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
