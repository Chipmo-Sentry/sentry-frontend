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

import { useToast } from "@/components/Toaster";
import { useAlertStreamContext } from "@/lib/alert-stream-context";
import { CATEGORY_LABEL, LEVEL_LABEL } from "@/lib/labels";
import {
  DEFAULT_PREFS,
  getPrefs,
  onPrefsChange,
  shouldNotify,
  type NotifPrefs,
} from "@/lib/notif-prefs";
import type { AlertLevel, AlertPublic } from "@/lib/types";

const BASE_TITLE = "Sentry";

function isActionable(level: AlertLevel): boolean {
  return level === "notify" || level === "review";
}

// Reuse a single AudioContext — browsers cap concurrent contexts (~6), so a
// burst of alerts must not new one up per beep.
let sharedAudioCtx: AudioContext | null = null;

/** Schedule one short tone on the shared context at `startOffset` seconds. */
function tone(
  ctx: AudioContext,
  startOffset: number,
  freq: number,
  dur: number,
  peak: number,
) {
  const t0 = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Play the alert chime. `urgent` (review level) gets a louder, repeated
 * triple-tone so staff can tell it apart from a routine `notify` ping. */
function playBeep(urgent: boolean) {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    if (!sharedAudioCtx) sharedAudioCtx = new Ctor();
    const ctx = sharedAudioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    if (urgent) {
      // Three rising urgent beeps.
      tone(ctx, 0, 1047, 0.16, 0.28);
      tone(ctx, 0.2, 1175, 0.16, 0.28);
      tone(ctx, 0.4, 1319, 0.22, 0.3);
    } else {
      tone(ctx, 0, 880, 0.34, 0.2);
    }
  } catch {
    // Audio blocked — non-fatal.
  }
}

export function NotificationListener() {
  const { alerts } = useAlertStreamContext();
  const { toast } = useToast();
  const seenRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const prefsRef = useRef<NotifPrefs>(DEFAULT_PREFS);
  const [unread, setUnread] = useState(0);

  // Track notification preferences (kept in a ref so the alert effect stays
  // dependency-light and always reads the latest value).
  useEffect(() => {
    prefsRef.current = getPrefs();
    return onPrefsChange(() => {
      prefsRef.current = getPrefs();
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

    // In-app toast (FE-L8) — shown even when muted, since it's silent + visual.
    // Live threshold breaches carry person_id + peak risk; surface them.
    {
      const a = last;
      const isBreach = a.triggered_by === "live_threshold";
      const parts = [`${CATEGORY_LABEL[a.category]} · ${Math.round(a.confidence * 100)}%`];
      if (isBreach && a.person_id != null) {
        parts.push(
          a.peak_risk_pct != null
            ? `Хүн #${a.person_id} · эрсдэл ${a.peak_risk_pct.toFixed(0)}`
            : `Хүн #${a.person_id}`,
        );
      }
      toast({
        title: `${isBreach ? "🚨 Шууд сэрэмжлүүлэг" : "🔔"} ${LEVEL_LABEL[a.alert_level]}`,
        description: parts.join(" · "),
        tone: a.alert_level === "review" ? "danger" : "warning",
      });
    }

    // Passive tab badge always counts when hidden, regardless of sound/popup.
    if (document.hidden) setUnread((u) => u + newActionable);

    // Active notification (sound/popup) is gated by prefs: snooze window, the
    // minimum-level threshold, and each channel's own toggle.
    const prefs = prefsRef.current;
    if (!shouldNotify(last.alert_level, prefs)) return;
    const urgent = last.alert_level === "review";

    if (prefs.sound) playBeep(urgent);

    if (
      prefs.popup &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      const a = last;
      const n = new Notification(
        `${urgent ? "🚨" : "🔔"} ${LEVEL_LABEL[a.alert_level]} — Sentry`,
        {
          body: `${CATEGORY_LABEL[a.category]} · ${Math.round(a.confidence * 100)}%`,
          tag: a.id,
        },
      );
      n.onclick = () => {
        window.focus();
        window.location.href = `/alerts/${a.id}`;
      };
    }
  }, [alerts, toast]);

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
