import { Button } from "@chipmo-sentry/ui-kit";
import Link from "next/link";

/** Branded Mongolian 404 — replaces Next's default English page so a mistyped
 * or stale URL doesn't dump the user onto an unstyled, off-brand screen. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-(--color-muted) p-6 text-center">
      <p className="text-6xl font-bold text-(--color-primary)">404</p>
      <h1 className="text-xl font-semibold">Хуудас олдсонгүй</h1>
      <p className="max-w-sm text-sm text-(--color-muted-foreground)">
        Таны хайсан хуудас байхгүй эсвэл шилжсэн байна.
      </p>
      <Button asChild>
        <Link href="/dashboard">Нүүр хуудас руу буцах</Link>
      </Button>
    </main>
  );
}
