"use client";

import Link from "next/link";

import { STAGE_LABEL, STAGE_ORDER, STATUS_COLOR, type CameraRow } from "@/lib/pipeline";

import { HealthDot } from "./ui";

/**
 * Camera × stage matrix: one row per camera, one column per pipeline stage, so
 * "which camera is broken at which stage" is a single glance. Every cell links
 * to that stage's detail page scoped to the camera.
 */
export function CameraMatrix({ rows }: { rows: CameraRow[] }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
        Камер бүрээр — урсгалын задаргаа
      </h2>
      <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--color-border)]">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted-foreground)]">
              <th className="px-3 py-2 font-medium">Камер</th>
              {STAGE_ORDER.map((s) => (
                <th key={s} className="px-3 py-2 font-medium">
                  {STAGE_LABEL[s]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.cam.path}
                className="border-b border-[var(--color-border)] last:border-0"
              >
                <td className="px-3 py-2.5 align-top">
                  <Link
                    href={`/pipeline/camera/${encodeURIComponent(row.cam.path)}`}
                    className="font-medium text-[var(--color-foreground)] hover:underline"
                  >
                    {row.cam.name}
                  </Link>
                  {row.node && (
                    <div className="text-[10px] text-[var(--color-muted-foreground)]">
                      {row.node.name}
                    </div>
                  )}
                </td>
                {STAGE_ORDER.map((s) => {
                  const cell = row.cells[s];
                  const color = STATUS_COLOR[cell.status];
                  const degraded = cell.status === "down" || cell.status === "warn";
                  return (
                    <td key={s} className="px-3 py-2.5 align-top">
                      <Link
                        href={`/pipeline/stage/${s}?camera=${encodeURIComponent(row.cam.path)}`}
                        className="group inline-flex flex-col gap-0.5"
                        title={cell.reason ?? STAGE_LABEL[s]}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <HealthDot status={cell.status} />
                          <span
                            className="text-xs group-hover:underline"
                            style={{ color: degraded ? color : "var(--color-foreground)" }}
                          >
                            {cell.short}
                          </span>
                        </span>
                        {degraded && cell.reason && (
                          <span className="text-[10px] text-[var(--color-muted-foreground)]">
                            {cell.reason}
                          </span>
                        )}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
