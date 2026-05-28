"use client";

import { Logo } from "@chipmo-sentry/ui-kit";
import { Bell, Brain, LogOut, Radio, Upload, Video } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { auth } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Самбар", icon: Bell },
  { href: "/live", label: "Шууд харах", icon: Radio },
  { href: "/clips/upload", label: "Видео илгээх", icon: Upload },
  { href: "/alerts", label: "Сэжигтэй үйлдэл", icon: Video },
  { href: "/behaviors", label: "Сэжиг шалгуур", icon: Brain },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function onLogout() {
    try {
      await auth.logout();
    } catch {
      // ignore — best-effort cookie clear
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-[var(--color-border)] bg-[var(--color-background)]">
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
    </aside>
  );
}
