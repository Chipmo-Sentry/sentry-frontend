"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Logo,
} from "@chipmo-sentry/ui-kit";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { auth, ApiError } from "@/lib/api";

// Same-origin refresh endpoint (see api.ts BASE rationale).
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// useSearchParams() needs a Suspense boundary in Next 15.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Only allow same-origin relative paths — reject "//evil.com", "https://…"
  // to avoid an open redirect via the `next` query param.
  const rawNext = params.get("next") ?? "/dashboard";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // docs/33 Sprint C — silent session resume. The middleware gates on the
  // ~15 min ACCESS cookie only (the refresh cookie is Path-scoped to
  // /api/v1/auth and invisible to it), so an idle-but-still-logged-in user
  // gets bounced here after every coffee break. Try one silent refresh: if the
  // 7-day refresh cookie is still valid, mint a new access cookie and bounce
  // straight back to `next` — no password re-entry.
  useEffect(() => {
    let cancelled = false;
    fetch(`${BASE}/api/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((r) => {
        if (!cancelled && r.ok) {
          router.replace(next);
          router.refresh();
        }
      })
      .catch(() => {
        /* no session — show the form */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await auth.login(email, password);
      router.push(next);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Сүлжээний алдаа. Дахин оролдоно уу.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-(--color-background) p-4">
      <div className="sentry-aurora" aria-hidden="true" />
      <Card className="relative z-10 w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo withWordmark className="h-10" />
          <CardTitle className="mt-2">Нэвтрэх</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={onSubmit}>
            <Input
              type="email"
              required
              autoComplete="email"
              placeholder="email@chipmo.mn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
            <Input
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
            {error ? (
              <p role="alert" className="text-sm text-(--color-danger)">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Нэвтэрч байна…" : "Нэвтрэх"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
