import type { ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import { BillingBanner } from "@/components/BillingBanner";
import { Toaster } from "@/components/Toaster";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Toaster>
      <AppShell>
        <BillingBanner />
        {children}
      </AppShell>
    </Toaster>
  );
}
