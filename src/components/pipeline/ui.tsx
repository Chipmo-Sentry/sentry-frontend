"use client";

import { STATUS_COLOR, STATUS_LABEL, type CellStatus } from "@/lib/pipeline";

/** Health dot — solid for ok/warn/down, dashed ring for "unknown" (no signal),
 * so absence of data is visually distinct from healthy. */
export function HealthDot({ status }: { status: CellStatus }) {
  const color = STATUS_COLOR[status];
  if (status === "unknown") {
    return (
      <span
        className="inline-block h-2.5 w-2.5 rounded-full border border-dashed"
        style={{ borderColor: color }}
        aria-hidden
      />
    );
  }
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ background: color }}
      aria-hidden
    />
  );
}

/** Dot + Mongolian status label, colored by status. */
export function StatusPill({ status }: { status: CellStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ color: STATUS_COLOR[status] }}>
      <HealthDot status={status} />
      <span className="text-xs">{STATUS_LABEL[status]}</span>
    </span>
  );
}
