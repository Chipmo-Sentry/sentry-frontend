import type { ReactNode } from "react";

/** Labeled form field wrapper used across management forms. */
export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">
        {label}
        {required ? (
          <span className="text-[var(--color-danger)]"> *</span>
        ) : null}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs text-[var(--color-muted-foreground)]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
