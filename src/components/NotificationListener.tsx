"use client";

/** Global alert notifier — mounted once in AppShell.
 *
 * For each newly streamed actionable alert (notify/review) it:
 *  - fires a browser Notification (if the user granted permission),
 *  - plays a short Web Audio beep (best-effort; browsers may block until the
 *    user has interacted with the page),
 *  - increments an unread counter shown in the tab title while hidden.
 *
 * It renders nothing. Reads the shared alert stream via context, so it does
 * not open its own EventSource. */

import { useEffect, useRef, useState } from "react";

import { useAlertStreamContext } from "@/lib/alert-stream-context";
import { isMuted, onMuteChange } from "@/lib/notif-prefs";
import type { AlertLevel, AlertPublic } from "@/lib/types";

const BASE_TITLE = "Chipmo Sentry";

const LEVEL_LABEL: Record<AlertLevel, string> = {
  ignore: "Үл хамаа",
  log: "Бүртгэсэн",
  notify: "Анхаар",
  review: "Шалга",
};

const CATEGORY_LABEL: Record<AlertPublic["category"], string> = {
  browsing: "Хайж байгаа",
  cart_pickup: "Сагсанд авсан",
  pocket_conceal: "Халаасанд хийсэн",
  other: "Бусад",
};

function isActionable(level: AlertLevel): boolean {
  return level === "notify" || level === "review";
}

// Reuse a single AudioContext — browsers cap concurrent contexts (~6), so a
// burst of alerts must not new one up per beep.
let sharedAudioCtx: AudioContext | null = null;

function playBeep() {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    if (!sharedAudioCtx) sharedAudioCtx = new Ctor();
    const ctx = sharedAudioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {
    // Audio blocked — non-fatal.
  }
}

export function NotificationListener() {
  const { alerts } = useAlertStreamContext();
  const seenRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const mutedRef = useRef(false);
  const [unread, setUnread] = useState(0);

  // Track the mute preference (kept in a ref so the alert effect stays
  // dependency-light and always reads the latest value).
  useEffect(() => {
    mutedRef.current = isMuted();
    return onMuteChange(() => {
      mutedRef.current = isMuted();
    });
  }, []);

  // React to new streamed alerts.
  useEffect(() => {
    // On first run, mark everything currently present as seen so we don't
    // replay a burst (covers reconnect / late mount). Live pushes after this
    // are genuinely new.
    if (!initializedRef.current) {
      for (const a of alerts) seenRef.current.add(a.id);
      initializedRef.current = true;
      return;
    }

    let newActionable = 0;
    let last: AlertPublic | null = null;
    for (const a of alerts) {
      if (seenRef.current.has(a.id)) continue;
      seenRef.current.add(a.id);
      if (isActionable(a.alert_level)) {
        newActionable += 1;
        last = a;
      }
    }
    // Bound the seen-set: these tabs run all day. Once it grows large, keep
    // only ids still present in the (capped) stream — everything else can't
    // re-arrive anyway.
    if (seenRef.current.size > 1000) {
      seenRef.current = new Set(alerts.map((a) => a.id));
    }

    if (newActionable === 0 || !last) return;

    // Muted: still keep the passive tab badge, but no sound/popup.
    if (mutedRef.current) {
      if (document.hidden) setUnread((u) => u + newActionable);
      return;
    }

    playBeep();

    if (
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      const a = last;
      const n = new Notification(`🔔 ${LEVEL_LABEL[a.alert_level]} — Chipmo Sentry`, {
        body: `${CATEGORY_LABEL[a.category]} · ${Math.round(a.confidence * 100)}%`,
        tag: a.id,
      });
      n.onclick = () => {
        window.focus();
        window.location.href = `/alerts/${a.id}`;
      };
    }

    if (document.hidden) {
      setUnread((u) => u + newActionable);
    }
  }, [alerts]);

  // Maintain the tab title badge; clear unread when the tab becomes visible.
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) ${BASE_TITLE}` : BASE_TITLE;
  }, [unread]);

  useEffect(() => {
    function onVisible() {
      if (!document.hidden) setUnread(0);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return null;
}
