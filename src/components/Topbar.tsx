"use client";

import {
  Avatar,
  AvatarFallback,
  Badge,
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@chipmo-sentry/ui-kit";
import { Bell, BellOff, LogOut, Menu, ShieldCheck } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { navTitle } from "@/components/Sidebar";
import { auth } from "@/lib/api";
import { isMuted, onMuteChange, setMuted } from "@/lib/notif-prefs";
import type { UserPublic } from "@/lib/types";

export function Topbar({
  user,
  onMenuClick,
}: {
  user: UserPublic | null;
  onMenuClick: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [muted, setMutedState] = useState(false);

  // Sync mute state on mount + across tabs (avoids SSR hydration mismatch by
  // reading localStorage only after mount).
  useEffect(() => {
    setMutedState(isMuted());
    return onMuteChange(() => setMutedState(isMuted()));
  }, []);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    // Turning notifications ON: request browser permission if not decided yet.
    if (!next && "Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }

  async function onLogout() {
    try {
      await auth.logout();
    } catch {
      // best-effort
    }
    router.push("/login");
    router.refresh();
  }

  const initial = user?.email.charAt(0).toUpperCase() ?? "?";

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-background)] px-4">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Цэс нээх"
        className="rounded-md p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <h1 className="flex-1 truncate text-base font-semibold">
        {navTitle(pathname)}
      </h1>

      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? "Мэдэгдэл асаах" : "Мэдэгдэл унтраах"}
        title={muted ? "Мэдэгдэл унтраалттай" : "Мэдэгдэл асаалттай"}
        className="rounded-md p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)]"
      >
        {muted ? (
          <BellOff className="h-5 w-5" />
        ) : (
          <Bell className="h-5 w-5" />
        )}
      </button>

      {user ? (
        <Dropdown>
          <DropdownTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-[var(--color-muted)]"
              aria-label="Хэрэглэгчийн цэс"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownTrigger>
          <DropdownContent align="end" className="w-56">
            <DropdownLabel className="flex flex-col gap-1">
              <span className="truncate text-sm font-medium">
                {user.email}
              </span>
              {user.is_super_admin ? (
                <Badge tone="neutral" className="w-fit">
                  <ShieldCheck className="h-3 w-3" />
                  Супер админ
                </Badge>
              ) : null}
            </DropdownLabel>
            <DropdownSeparator />
            <DropdownItem onSelect={onLogout}>
              <LogOut className="h-4 w-4" />
              Гарах
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      ) : (
        <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--color-muted)]" />
      )}
    </header>
  );
}
