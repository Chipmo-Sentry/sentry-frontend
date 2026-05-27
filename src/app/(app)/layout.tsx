import type { ReactNode } from "react";

import { Sidebar } from "@/components/Sidebar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-[var(--color-muted)]">
        {children}
      </main>
    </div>
  );
}
