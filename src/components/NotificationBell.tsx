"use client";

/** Notification bell with a dropdown list of recent actionable alerts.
 *
 * Source = the shared alert SSE stream (this session's live pushes) merged with
 * a one-time fetch of recent actionable alerts on mount (the stream itself does
 * not seed history). Clicking an item opens that alert's detail page. An unread
 * badge counts alerts newer than the last time the bell was opened (persisted in
 * localStorage so it survives navigation/reloads). */

import {
  Badge,
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@chipmo-sentry/ui-kit";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { alerts as alertsApi } from "@/lib/api";
import { useAlertStreamContext } from "@/lib/alert-stream-context";
import { CATEGORY_LABEL, LEVEL_LABEL } from "@/lib/labels";
import { relativeTime } from "@/lib/time";
import type { AlertLevel, AlertPublic } from "@/lib/types";

const LAST_SEEN_KEY = "notif:lastSeen";
const MAX_ITEMS = 15;

const LEVEL_TONE: Record<AlertLevel, "ignore" | "log" | "notify" | "review"> = {
  ignore: "ignore",
  log: "log",
  notify: "notify",
  review: "review",
};

function isActionable(level: AlertLevel): boolean {
  return level === "notify" || level === "review";
}

export function NotificationBell() {
  const router = useRouter();
  const { alerts: streamed } = useAlertStreamContext();
  const [history, setHistory] = useState<AlertPublic[]>([]);
  const [lastSeen, setLastSeen] = useState<number>(0);

  // Seed recent actionable alerts once — the SSE stream only carries pushes that
  // arrive after mount, so without this the bell is empty until a new alert.
  useEffect(() => {
    let cancelled = false;
    alertsApi.list({ min_level: "notify", limit: MAX_ITEMS }).then(
      (list) => {
        if (!cancelled) setHistory(list);
      },
      () => {
        /* bell still works off the live stream */
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem(LAST_SEEN_KEY);
    setLastSeen(raw ? Number(raw) : 0);
  }, []);

  // Merge live + seeded history, actionable only, dedup by id, newest-first.
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: AlertPublic[] = [];
    for (const a of [...streamed, ...history]) {
      if (seen.has(a.id) || !isActionable(a.alert_level)) continue;
      seen.add(a.id);
      out.push(a);
    }
    out.sort(
      (x, y) =>
        new Date(y.created_at).getTime() - new Date(x.created_at).getTime(),
    );
    return out.slice(0, MAX_ITEMS);
  }, [streamed, history]);

  const unread = useMemo(
    () =>
      items.filter((a) => new Date(a.created_at).getTime() > lastSeen).length,
    [items, lastSeen],
  );

  function markSeen() {
    // Mark seen up to the NEWEST alert's own (server) timestamp, not Date.now():
    // unread compares against alert.created_at (server clock), so using the
    // client clock here leaves the badge stuck whenever the server runs ahead.
    const newest = items.length
      ? Math.max(...items.map((a) => new Date(a.created_at).getTime()))
      : Date.now();
    setLastSeen(newest);
    try {
      window.localStorage.setItem(LAST_SEEN_KEY, String(newest));
    } catch {
      /* private mode — unread just won't persist */
    }
  }

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          type="button"
          onClick={markSeen}
          aria-label={
            unread > 0 ? `Мэдэгдлүүд (${unread} шинэ)` : "Мэдэгдлүүд"
          }
          className="relative rounded-md p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)]"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold leading-none text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </DropdownTrigger>
      <DropdownContent align="end" className="w-80">
        <DropdownLabel>Мэдэгдлүүд</DropdownLabel>
        <DropdownSeparator />
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-[var(--color-muted-foreground)]">
            Шинэ мэдэгдэл алга
          </div>
        ) : (
          items.map((a) => (
            <DropdownItem
              key={a.id}
              onSelect={() => router.push(`/alerts/${a.id}`)}
              className="flex flex-col items-start gap-1"
            >
              <div className="flex w-full items-center gap-2">
                <Badge tone={LEVEL_TONE[a.alert_level]}>
                  {LEVEL_LABEL[a.alert_level]}
                </Badge>
                <span className="truncate text-sm font-medium">
                  {CATEGORY_LABEL[a.category]}
                </span>
                <span className="ml-auto shrink-0 text-xs text-[var(--color-muted-foreground)]">
                  {relativeTime(a.created_at)}
                </span>
              </div>
              {a.peak_risk_pct != null ? (
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {a.person_id != null ? `Хүн #${a.person_id} · ` : ""}
                  эрсдэл {a.peak_risk_pct.toFixed(0)}%
                </span>
              ) : null}
            </DropdownItem>
          ))
        )}
        <DropdownSeparator />
        <DropdownItem
          onSelect={() => router.push("/alerts")}
          className="justify-center text-sm text-[var(--color-primary)]"
        >
          Бүгдийг харах
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
