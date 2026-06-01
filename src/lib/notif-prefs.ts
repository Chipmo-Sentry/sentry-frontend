"use client";

/** Tiny client-side notification preference store (localStorage + event).
 *
 * Controls whether NotificationListener fires sound/browser notifications.
 * Survives reloads and syncs across tabs via the native `storage` event. */

const KEY = "chipmo:notif-muted";
const EVENT = "chipmo:notif-pref-change";

export function isMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

export function setMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, muted ? "1" : "0");
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Subscribe to mute changes (same tab via custom event, other tabs via storage). */
export function onMuteChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}
