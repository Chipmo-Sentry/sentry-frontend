/** EventSource-based hook for the backend's /api/v1/alerts/stream SSE.
 *
 * The browser's EventSource API sends cookies automatically when
 * `withCredentials: true`. There is no header-based auth fallback —
 * EventSource doesn't allow custom headers — so SSE works only for
 * cookie-authenticated users. That's fine for our UI flows. */

import { useEffect, useRef, useState } from "react";

import type { AlertPublic } from "./types";

// Empty default → same-origin EventSource through the Next `/api` rewrite, so
// the SameSite=Lax cookie is sent (EventSource can't set headers). See api.ts.
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/** Keep at most this many streamed alerts in memory (newest-first). */
const MAX_STREAM_ALERTS = 200;

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
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const url = `${BASE}/api/v1/alerts/stream`;
    const source = new EventSource(url, { withCredentials: true });
    sourceRef.current = source;

    source.onopen = () => {
      setConnected(true);
      setError(null);
    };

    source.addEventListener("alert", (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as AlertPublic;
        // Cap the in-memory buffer — these dashboards run all day on store TVs,
        // so an unbounded prepend would leak memory.
        setAlerts((prev) => [parsed, ...prev].slice(0, MAX_STREAM_ALERTS));
      } catch {
        // Drop malformed event; backend should never send these
      }
    });

    source.onerror = () => {
      setConnected(false);
      setError("Холболт тасарсан. Дахин холбогдох гэж байна…");
      // EventSource automatically reconnects with exponential backoff
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, []);

  return { alerts, connected, error };
}
