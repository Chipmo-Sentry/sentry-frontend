"use client";

/** App-wide billing status banner (T14).
 *
 * Mounted once in the (app) layout. Fetches GET /api/v1/billing with a 5-min
 * module-level cache so navigating between pages does NOT re-fetch — the
 * banner is informational, not real-time. Errors and loading states render
 * NOTHING (the banner must never get in the user's way).
 */

import { Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { billing, type BillingSummary } from "@/lib/api";

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { data: BillingSummary; at: number } | null = null;

function cachedSummary(): BillingSummary | null {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  return null;
}

/** Drop the cached summary so the banner refreshes on next mount — call after
 * anything that changes the wallet (promo redeem, future topup flows). */
export function invalidateBillingSummary(): void {
  cache = null;
}

export function BillingBanner() {
  const [summary, setSummary] = useState<BillingSummary | null>(cachedSummary);

  useEffect(() => {
    if (cachedSummary()) return;
    let cancelled = false;
    billing.summary().then(
      (s) => {
        cache = { data: s, at: Date.now() };
        if (!cancelled) setSummary(s);
      },
      () => {
        // Silent — a failed billing fetch must never block the app UI.
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!summary) return null;

  const promoActive =
    summary.promo_free_until !== null &&
    new Date(summary.promo_free_until).getTime() > Date.now();

  let tone: "danger" | "warning" | null = null;
  let message: string | null = null;

  if (summary.status === "suspended") {
    tone = "danger";
    message =
      "Хэтэвчний үлдэгдэл дууссан тул live үзэх боломж хаагдсан. Цэнэглэснээр шууд сэргэнэ.";
  } else if (summary.status === "credit") {
    tone = "warning";
    message =
      "Түр нээлттэй горимд байна — хэрэглээ үргэлжлэн тооцогдож байна.";
  } else if (
    !promoActive &&
    summary.daily_rate_mnt > 0 &&
    summary.balance_mnt > 0 &&
    summary.balance_mnt / summary.daily_rate_mnt < 7
  ) {
    const days = Math.floor(summary.balance_mnt / summary.daily_rate_mnt);
    tone = "warning";
    message = `Хэтэвчний үлдэгдэл ойролцоогоор ${days} өдөр хүрэлцэнэ. Тасалдалгүй ажиллуулахын тулд цэнэглээрэй.`;
  }

  if (!tone || !message) return null;

  const toneClass =
    tone === "danger"
      ? "border-(--color-danger)/40 bg-(--color-danger)/10 text-(--color-danger)"
      : "border-(--color-warning)/40 bg-(--color-warning)/15 text-(--color-foreground)";

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm ${toneClass}`}
    >
      <span className="flex items-center gap-2">
        <Wallet className="h-4 w-4 shrink-0" aria-hidden />
        {message}
      </span>
      <Link
        href="/billing"
        className="shrink-0 font-medium underline underline-offset-2 hover:opacity-80"
      >
        Цэнэглэх
      </Link>
    </div>
  );
}
