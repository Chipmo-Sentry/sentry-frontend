"use client";

import { Button } from "@chipmo-sentry/ui-kit";
import { useEffect } from "react";

/** Route-level error boundary. Catches render/runtime errors anywhere in the
 * app tree and shows a branded Mongolian recovery screen with a retry button,
 * instead of Next's default unstyled English error overlay. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the console so it still reaches logs/observability.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-muted)] p-6 text-center">
      <h1 className="text-xl font-semibold">Алдаа гарлаа</h1>
      <p className="max-w-sm text-sm text-[var(--color-muted-foreground)]">
        Уучлаарай, гэнэтийн алдаа гарлаа. Дахин оролдоно уу.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Дахин оролдох</Button>
        <Button variant="secondary" onClick={() => window.location.assign("/dashboard")}>
          Нүүр хуудас
        </Button>
      </div>
    </main>
  );
}
