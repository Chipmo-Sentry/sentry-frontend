"use client";

import { Logo } from "@chipmo-sentry/ui-kit";
import {
  Bell,
  Brain,
  Cctv,
  LogOut,
  Radio,
  ScrollText,
  ShieldCheck,
  Store,
  Users,
  Video,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { auth } from "@/lib/api";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  superAdmin?: boolean;
};

export const NAV: readonly NavItem[] = [
  { href: "/dashboard", label: "Самбар", icon: Bell },
  { href: "/live", label: "Шууд харах", icon: Radio },
  // ADR-0014 (live-first): clip upload is admin/debug-only — route stays
  // reachable by direct URL but is not part of the customer nav.
  { href: "/alerts", label: "Сэжигтэй үйлдэл", icon: Video },
  { href: "/behaviors", label: "Сэжиг шалгуур", icon: Brain },
  { href: "/stores", label: "Дэлгүүр", icon: Store },
  { href: "/cameras", label: "Камер", icon: Cctv },
  { href: "/team", label: "Хэрэглэгчид", icon: Users },
  { href: "/logs", label: "Лог", icon: ScrollText },
  { href: "/billing", label: "Төлбөр", icon: Wallet },
  { href: "/admin", label: "Админ", icon: ShieldCheck, superAdmin: true },
];

/** Returns the nav label for a given pathname (used by Topbar). */
export function navTitle(pathname: string): string {
  const match = NAV.find(
    (n) => pathname === n.href || pathname.startsWith(`${n.href}/`),
  );
  return match?.label ?? "Chipmo Sentry";
}

/** Inner nav content shared by the desktop rail and the mobile drawer. */
function SidebarContent({
  isSuperAdmin = false,
  onNavigate,
}: {
  isSuperAdmin?: boolean;
  onNavigate?: () => void;
}) {
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

  const items = NAV.filter((item) => !item.superAdmin || isSuperAdmin);

  return (
    <div className="flex h-full flex-col bg-[var(--color-background)]">
      <div className="flex h-14 items-center gap-2 border-b border-[var(--color-border)] px-4">
        <Logo className="h-6 w-6" />
        <span className="text-sm font-semibold">Chipmo Sentry</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {items.map((item) => {
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
export function Sidebar({ isSuperAdmin }: { isSuperAdmin?: boolean }) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-[var(--color-border)] lg:block">
      <SidebarContent isSuperAdmin={isSuperAdmin} />
    </aside>
  );
}

/** Mobile slide-in drawer with backdrop. Controlled by AppShell. */
export function MobileSidebar({
  open,
  onClose,
  isSuperAdmin,
}: {
  open: boolean;
  onClose: () => void;
  isSuperAdmin?: boolean;
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
        <SidebarContent isSuperAdmin={isSuperAdmin} onNavigate={onClose} />
      </div>
    </div>
  );
}
