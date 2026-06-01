"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { MobileSidebar, Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { auth } from "@/lib/api";
import type { UserPublic } from "@/lib/types";

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<UserPublic | null>(null);
  const pathname = usePathname();

  // Fetch the current user once; AppShell mounts once for the whole (app) tree.
  useEffect(() => {
    let cancelled = false;
    auth.me().then(
      (u) => {
        if (!cancelled) setUser(u);
      },
      () => {
        // unauthenticated state is handled by middleware; ignore here
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isSuperAdmin = user?.is_super_admin ?? false;

  return (
    <div className="flex min-h-screen">
      <Sidebar isSuperAdmin={isSuperAdmin} />
      <MobileSidebar
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        isSuperAdmin={isSuperAdmin}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-auto bg-[var(--color-muted)]">
          {children}
        </main>
      </div>
    </div>
  );
}
