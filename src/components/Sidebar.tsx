"use client";

import { Logo } from "@chipmo-sentry/ui-kit";
import { Bell, Brain, LogOut, Radio, Upload, Video, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { auth } from "@/lib/api";

export const NAV = [
  { href: "/dashboard", label: "Самбар", icon: Bell },
  { href: "/live", label: "Шууд харах", icon: Radio },
  { href: "/clips/upload", label: "Видео илгээх", icon: Upload },
  { href: "/alerts", label: "Сэжигтэй үйлдэл", icon: Video },
  { href: "/behaviors", label: "Сэжиг шалгуур", icon: Brain },
] as const;

/** Returns the nav label for a given pathname (used by Topbar). */
export function navTitle(pathname: string): string {
  const match = NAV.find(
    (n) => pathname === n.href || pathname.startsWith(`${n.href}/`),
  );
  return match?.label ?? "Chipmo Sentry";
}

/** Inner nav content shared by the desktop rail and the mobile drawer. */
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  async function onLogout() {
    try {
      await auth.logout();
    } catch {
      // ignore — best-effort cookie clear
    }
    onNavigate?.();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-background)]">
      <div className="flex h-14 items-center gap-2 border-b border-[var(--color-border)] px-4">
        <Logo className="h-6 w-6" />
        <span className="text-sm font-semibold">Chipmo Sentry</span>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : "text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={onLogout}
        className="m-2 flex items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)]"
      >
        <LogOut className="h-4 w-4" aria-hidden />
        Гарах
      </button>
    </div>
  );
}

/** Desktop sidebar rail — fixed width, hidden below lg. */
export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-[var(--color-border)] lg:block">
      <SidebarContent />
    </aside>
  );
}

/** Mobile slide-in drawer with backdrop. Controlled by AppShell. */
export function MobileSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Цэс"
        className={`absolute inset-y-0 left-0 w-64 border-r border-[var(--color-border)] shadow-xl transition-transform ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Хаах"
          className="absolute right-2 top-2 z-10 rounded-md p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent onNavigate={onClose} />
      </div>
    </div>
  );
}
