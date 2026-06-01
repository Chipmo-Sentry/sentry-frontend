import type { ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import { Toaster } from "@/components/Toaster";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Toaster>
      <AppShell>{children}</AppShell>
    </Toaster>
  );
}
