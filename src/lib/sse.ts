/** EventSource-based hooks/helpers for the backend's SSE endpoints.
 *
 * The browser's EventSource API sends cookies automatically when
 * `withCredentials: true`. There is no header-based auth fallback —
 * EventSource doesn't allow custom headers — so SSE works only for
 * cookie-authenticated users. That's fine for our UI flows.
 *
 * docs/33 P0-8 (Sprint C): EventSource auto-reconnects only on NETWORK errors;
 * per spec a non-2xx response terminates it for good. Our access cookie expires
 * in ~15 min, so an all-day dashboard tab's streams died permanently on the
 * first 401 and the "security monitor" silently became a screensaver. Every
 * stream must therefore go through `openResilientEventSource`, which refreshes
 * the session and reopens with backoff when the source is CLOSED. */

import { useEffect, useRef, useState } from "react";

import type { AlertPublic } from "./types";

// Empty default → same-origin EventSource through the Next `/api` rewrite, so
// the SameSite=Lax cookie is sent (EventSource can't set headers). See api.ts.
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/** Keep at most this many streamed alerts in memory (newest-first). */
const MAX_STREAM_ALERTS = 200;

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

// Single-flight session refresh. Deliberately NOT imported from api.ts — that
// file carries in-flight feature work and its refresh helper isn't exported;
// this hits the same endpoint with the same single-flight discipline.
let refreshInFlight: Promise<boolean> | null = null;
function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch(`${BASE}/api/v1/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/** Open an EventSource that SURVIVES access-token expiry.
 *
 * `wire` attaches the caller's event listeners to each (re)created source.
 * `onState` reports connectivity for status dots. Returns a close function.
 *
 * Behaviour: while the browser itself retries (readyState CONNECTING) we stay
 * hands-off; once the source is CLOSED (non-2xx, e.g. 401 after cookie expiry)
 * we refresh the session and recreate the source with exponential backoff. */
export function openResilientEventSource(
  url: string,
  wire: (es: EventSource) => void,
  onState?: (connected: boolean) => void,
): () => void {
  let es: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let backoff = RECONNECT_MIN_MS;
  let closed = false;

  const open = () => {
    if (closed) return;
    const source = new EventSource(url, { withCredentials: true });
    es = source;
    wire(source);
    source.onopen = () => {
      backoff = RECONNECT_MIN_MS;
      onState?.(true);
    };
    source.onerror = () => {
      onState?.(false);
      // CONNECTING → the browser is auto-retrying a transient network blip.
      // CLOSED → terminal (401 etc.): refresh the cookie and rebuild.
      if (source.readyState !== EventSource.CLOSED || closed) return;
      source.close();
      if (es === source) es = null;
      const delay = backoff;
      backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
      timer = setTimeout(() => {
        if (closed) return;
        // Best-effort: reopen even if refresh fails (the backend may have been
        // briefly down with the session still valid). A dead session keeps
        // cycling at max backoff until any page navigation redirects to /login.
        void refreshSession().finally(() => {
          if (!closed) open();
        });
      }, delay);
    };
  };

  open();
  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    es?.close();
    es = null;
  };
}

export interface AlertStreamState {
  alerts: AlertPublic[];
  connected: boolean;
  error: string | null;
}

/** Subscribe to alert push events. Returns the *newest-first* list of
 * alerts received in this session, plus connection state.
 *
 * The hook does NOT seed from /api/v1/alerts — pair it with a one-time
 * fetch on mount if the consumer needs history. */
export function useAlertStream(): AlertStreamState {
  const [alerts, setAlerts] = useState<AlertPublic[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const close = openResilientEventSource(
      `${BASE}/api/v1/alerts/stream`,
      (source) => {
        source.addEventListener("alert", (event: MessageEvent) => {
          try {
            const parsed = JSON.parse(event.data) as AlertPublic;
            // Cap the in-memory buffer — these dashboards run all day on store
            // TVs, so an unbounded prepend would leak memory.
            setAlerts((prev) => [parsed, ...prev].slice(0, MAX_STREAM_ALERTS));
          } catch {
            // Drop malformed event; backend should never send these
          }
        });
      },
      (up) => {
        setConnected(up);
        setError(up ? null : "Холболт тасарсан. Дахин холбогдох гэж байна…");
      },
    );
    closeRef.current = close;
    return () => {
      close();
      closeRef.current = null;
    };
  }, []);

  return { alerts, connected, error };
}
