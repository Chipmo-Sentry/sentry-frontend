"use client";

/** Client-side notification preference store (localStorage + event).
 *
 * Controls how NotificationListener reacts to live actionable alerts:
 *  - `sound`    — play the audio beep,
 *  - `popup`    — fire a browser Notification,
 *  - `minLevel` — minimum alert level that actively notifies (sound/popup);
 *                 quieter levels still show the silent in-app toast + bell,
 *  - `snoozeUntil` — epoch ms; while in the future, sound/popup are paused and
 *                 auto-resume once it passes (no rewrite needed — readers compare
 *                 against the current clock).
 *
 * Survives reloads and syncs across tabs via the native `storage` event.
 * Migrates the old binary `chipmo:notif-muted` key on first read. */

import type { AlertLevel } from "@/lib/types";

/** Levels that can actively notify (ordered quiet → loud). */
export type NotifLevel = "notify" | "review";

export interface NotifPrefs {
  sound: boolean;
  popup: boolean;
  minLevel: NotifLevel;
  /** Epoch ms; 0 = not snoozed. */
  snoozeUntil: number;
}

const KEY = "chipmo:notif-prefs";
const LEGACY_MUTE_KEY = "chipmo:notif-muted";
const EVENT = "chipmo:notif-pref-change";

export const DEFAULT_PREFS: NotifPrefs = {
  sound: true,
  popup: true,
  minLevel: "notify",
  snoozeUntil: 0,
};

/** Higher number = more urgent. */
const LEVEL_RANK: Record<NotifLevel, number> = { notify: 0, review: 1 };

function sanitize(raw: unknown): NotifPrefs {
  const p = (raw ?? {}) as Partial<NotifPrefs>;
  return {
    sound: typeof p.sound === "boolean" ? p.sound : DEFAULT_PREFS.sound,
    popup: typeof p.popup === "boolean" ? p.popup : DEFAULT_PREFS.popup,
    minLevel: p.minLevel === "review" ? "review" : "notify",
    snoozeUntil:
      typeof p.snoozeUntil === "number" && p.snoozeUntil > 0 ? p.snoozeUntil : 0,
  };
}

export function getPrefs(): NotifPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  const stored = window.localStorage.getItem(KEY);
  if (stored) {
    try {
      return sanitize(JSON.parse(stored));
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }
  // One-time migration from the old all-or-nothing mute flag.
  if (window.localStorage.getItem(LEGACY_MUTE_KEY) === "1") {
    return { ...DEFAULT_PREFS, sound: false, popup: false };
  }
  return { ...DEFAULT_PREFS };
}

export function setPrefs(patch: Partial<NotifPrefs>): void {
  if (typeof window === "undefined") return;
  const next = sanitize({ ...getPrefs(), ...patch });
  window.localStorage.setItem(KEY, JSON.stringify(next));
  // Drop the legacy key so it can't shadow the new prefs after a downgrade.
  window.localStorage.removeItem(LEGACY_MUTE_KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Pause sound/popup for `minutes`, then auto-resume. */
export function snooze(minutes: number): void {
  setPrefs({ snoozeUntil: Date.now() + minutes * 60_000 });
}

export function clearSnooze(): void {
  setPrefs({ snoozeUntil: 0 });
}

/** True while a snooze window is still active. */
export function isSnoozed(prefs: NotifPrefs, now: number = Date.now()): boolean {
  return prefs.snoozeUntil > now;
}

/** Whether an alert of `level` is allowed to actively notify (sound/popup),
 * i.e. not snoozed and at/above the configured minimum level. Quieter levels
 * still get the silent toast + bell handled by the caller. */
export function shouldNotify(
  level: AlertLevel,
  prefs: NotifPrefs,
  now: number = Date.now(),
): boolean {
  if (isSnoozed(prefs, now)) return false;
  if (level !== "notify" && level !== "review") return false;
  return LEVEL_RANK[level] >= LEVEL_RANK[prefs.minLevel];
}

/** Subscribe to pref changes (same tab via custom event, other tabs via storage). */
export function onPrefsChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === LEGACY_MUTE_KEY) cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}
