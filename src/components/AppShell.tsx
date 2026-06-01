"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { MobileSidebar, Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-auto bg-[var(--color-muted)]">
          {children}
        </main>
      </div>
    </div>
  );
}
