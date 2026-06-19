"use client";

/** Topbar notification-settings menu.
 *
 * Replaces the old binary mute toggle with granular control over how live
 * actionable alerts reach the user: sound on/off, browser popup on/off, the
 * minimum level worth interrupting for, and a temporary snooze. Reads/writes
 * the shared `notif-prefs` store so NotificationListener picks up changes
 * instantly (and across tabs). */

import {
  Dropdown,
  DropdownCheckboxItem,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@chipmo-sentry/ui-kit";
import { Bell, BellOff, Check, Moon } from "lucide-react";
import { useEffect, useState } from "react";

import {
  clearSnooze,
  DEFAULT_PREFS,
  getPrefs,
  isSnoozed,
  onPrefsChange,
  setPrefs,
  snooze,
  type NotifLevel,
  type NotifPrefs,
} from "@/lib/notif-prefs";

const SNOOZE_OPTIONS = [15, 30, 60] as const;

const MIN_LEVELS: { value: NotifLevel; label: string }[] = [
  { value: "notify", label: "Анхаар ба дээш" },
  { value: "review", label: "Зөвхөн Шалга" },
];

function permissionState(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window))
    return "unsupported";
  return Notification.permission;
}

export function NotificationSettings() {
  // Init with defaults to avoid SSR/hydration mismatch; hydrate from storage
  // (and subscribe to changes) only after mount.
  const [prefs, setPrefsState] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [perm, setPerm] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [now, setNow] = useState(0);

  useEffect(() => {
    setPrefsState(getPrefs());
    setPerm(permissionState());
    setNow(Date.now());
    return onPrefsChange(() => setPrefsState(getPrefs()));
  }, []);

  const snoozed = now > 0 && isSnoozed(prefs, now);

  // While snoozed, tick once a second to update the countdown and flip the icon
  // back the moment the window lapses.
  useEffect(() => {
    if (!snoozed) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [snoozed]);

  const snoozeRemaining = snoozed
    ? Math.max(1, Math.ceil((prefs.snoozeUntil - now) / 60_000))
    : 0;

  function togglePopup() {
    const next = !prefs.popup;
    setPrefs({ popup: next });
    if (
      next &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      void Notification.requestPermission().then(() =>
        setPerm(permissionState()),
      );
    }
  }

  const TriggerIcon = snoozed ? Moon : prefs.sound || prefs.popup ? Bell : BellOff;
  const label = snoozed
    ? `Мэдэгдэл түр чимээгүй (${snoozeRemaining} мин)`
    : "Мэдэгдлийн тохиргоо";

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className="rounded-md p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)]"
        >
          <TriggerIcon className="h-5 w-5" />
        </button>
      </DropdownTrigger>
      <DropdownContent align="end" className="w-64">
        <DropdownLabel>Мэдэгдлийн тохиргоо</DropdownLabel>
        <DropdownSeparator />

        <DropdownCheckboxItem
          checked={prefs.sound}
          onSelect={(e) => {
            e.preventDefault();
            setPrefs({ sound: !prefs.sound });
          }}
        >
          Дуут дохио
        </DropdownCheckboxItem>
        <DropdownCheckboxItem
          checked={prefs.popup}
          onSelect={(e) => {
            e.preventDefault();
            togglePopup();
          }}
        >
          Хөтчийн попап
        </DropdownCheckboxItem>

        {prefs.popup && perm === "denied" ? (
          <div className="px-2 py-1.5 text-xs text-[var(--color-danger)]">
            Хөтөч зөвшөөрөл хаасан байна. Хаягийн мөрийн 🔒 дээрээс зөвшөөрнө үү.
          </div>
        ) : null}

        <DropdownSeparator />
        <DropdownLabel className="text-xs font-normal text-[var(--color-muted-foreground)]">
          Дуу/попап өгөх доод түвшин
        </DropdownLabel>
        {MIN_LEVELS.map((lvl) => (
          <DropdownItem
            key={lvl.value}
            onSelect={(e) => {
              e.preventDefault();
              setPrefs({ minLevel: lvl.value });
            }}
          >
            <span className="flex h-4 w-4 items-center justify-center">
              {prefs.minLevel === lvl.value ? (
                <Check className="h-4 w-4" />
              ) : null}
            </span>
            {lvl.label}
          </DropdownItem>
        ))}

        <DropdownSeparator />
        <DropdownLabel className="text-xs font-normal text-[var(--color-muted-foreground)]">
          Түр чимээгүй
        </DropdownLabel>
        {snoozed ? (
          <DropdownItem onSelect={() => clearSnooze()}>
            <Moon className="h-4 w-4" />
            Болих ({snoozeRemaining} мин үлдсэн)
          </DropdownItem>
        ) : (
          SNOOZE_OPTIONS.map((m) => (
            <DropdownItem key={m} onSelect={() => snooze(m)}>
              {m} минут
            </DropdownItem>
          ))
        )}
      </DropdownContent>
    </Dropdown>
  );
}
