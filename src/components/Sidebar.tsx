"use client";

import { Logo } from "@chipmo-sentry/ui-kit";
import {
  Activity,
  Bell,
  Brain,
  Cctv,
  ChevronDown,
  LogOut,
  Radio,
  ScrollText,
  ShieldCheck,
  Store,
  Users,
  Video,
  Wallet,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { NotificationSettings } from "@/components/NotificationSettings";
import { auth } from "@/lib/api";

type NavChild = { href: string; label: string };
type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  superAdmin?: boolean;
  children?: NavChild[];
};

export const NAV: readonly NavItem[] = [
  {
    href: "/pipeline",
    label: "Урсгал",
    icon: Workflow,
    children: [
      { href: "/pipeline/stage/camera", label: "Камер" },
      { href: "/pipeline/stage/ingest", label: "Cloud ingest" },
      { href: "/pipeline/stage/yolo", label: "YOLO" },
      { href: "/pipeline/stage/tracker", label: "Tracker + дүрэм" },
      { href: "/pipeline/stage/vlm", label: "VLM" },
      { href: "/pipeline/stage/decision", label: "Шийдвэр" },
    ],
  },
  { href: "/dashboard", label: "Самбар", icon: Bell },
  { href: "/live", label: "Шууд харах", icon: Radio },
  { href: "/health", label: "Эрүүл мэнд", icon: Activity },
  // ADR-0014 (live-first): clip upload is admin/debug-only — route stays
  // reachable by direct URL but is not part of the customer nav.
  { href: "/alerts", label: "Эрсдэлтэй үйлдэл", icon: Video },
  { href: "/behaviors", label: "Эрсдэл шалгуур", icon: Brain },
  { href: "/stores", label: "Дэлгүүр", icon: Store },
  { href: "/cameras", label: "Камер", icon: Cctv },
  { href: "/team", label: "Хэрэглэгчид", icon: Users },
  { href: "/logs", label: "Лог", icon: ScrollText },
  { href: "/billing", label: "Төлбөр", icon: Wallet },
  { href: "/admin", label: "Админ", icon: ShieldCheck, superAdmin: true },
];

/** Returns the nav label for a given pathname (used by Topbar). */
export function navTitle(pathname: string): string {
  for (const n of NAV) {
    const child = n.children?.find((c) => pathname === c.href);
    if (child) return child.label;
  }
  const match = NAV.find(
    (n) => pathname === n.href || pathname.startsWith(`${n.href}/`),
  );
  return match?.label ?? "Sentry";
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
  const [open, setOpen] = useState<Record<string, boolean>>({});

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
    <div className="flex h-full flex-col bg-(--color-background)">
      <div className="flex h-14 items-center gap-2 border-b border-(--color-border) px-4">
        <Logo className="h-6 w-6" />
        <span className="text-sm font-semibold">Sentry</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {items.map((item) => {
          const sectionActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const hasChildren = !!item.children?.length;
          const Icon = item.icon;
          // Parent highlights on its exact route; children own their own highlight.
          const linkActive = hasChildren ? pathname === item.href : sectionActive;
          const expanded = hasChildren ? (open[item.href] ?? sectionActive) : false;
          return (
            <div key={item.href}>
              <div className="flex items-center gap-1">
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex flex-1 items-center gap-3 rounded-(--radius) px-3 py-2 text-sm transition-colors ${
                    linkActive
                      ? "bg-(--color-primary) text-(--color-primary-foreground)"
                      : "text-(--color-foreground) hover:bg-(--color-muted)"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {item.label}
                </Link>
                {hasChildren && (
                  <button
                    type="button"
                    onClick={() =>
                      setOpen((o) => ({ ...o, [item.href]: !(o[item.href] ?? sectionActive) }))
                    }
                    aria-label={expanded ? "Хураах" : "Дэлгэх"}
                    aria-expanded={expanded}
                    className="rounded-(--radius) p-1.5 text-(--color-muted-foreground) transition-colors hover:bg-(--color-muted)"
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${expanded ? "" : "-rotate-90"}`}
                      aria-hidden
                    />
                  </button>
                )}
              </div>
              {hasChildren && expanded && (
                <div className="ml-4.5 mt-0.5 space-y-0.5 border-l border-(--color-border) pl-3">
                  {item.children!.map((child) => {
                    const cActive = pathname === child.href;
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onNavigate}
                        className={`block rounded-(--radius) px-3 py-1.5 text-sm transition-colors ${
                          cActive
                            ? "bg-(--color-primary) text-(--color-primary-foreground)"
                            : "text-(--color-muted-foreground) hover:bg-(--color-muted) hover:text-(--color-foreground)"
                        }`}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="space-y-1 border-t border-(--color-border) p-2">
        <NotificationSettings />
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-(--radius) px-3 py-2 text-sm text-(--color-muted-foreground) transition-colors hover:bg-(--color-muted) hover:text-(--color-foreground)"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Гарах
        </button>
      </div>
    </div>
  );
}

/** Desktop sidebar rail — fixed width, hidden below lg. */
export function Sidebar({ isSuperAdmin }: { isSuperAdmin?: boolean }) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-(--color-border) lg:block">
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
        className={`absolute inset-y-0 left-0 w-64 border-r border-(--color-border) shadow-xl transition-transform ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Хаах"
          className="absolute right-2 top-2 z-10 rounded-md p-1.5 text-(--color-muted-foreground) hover:bg-(--color-muted)"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent isSuperAdmin={isSuperAdmin} onNavigate={onClose} />
      </div>
    </div>
  );
}
