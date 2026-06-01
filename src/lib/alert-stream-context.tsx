"use client";

/** Single app-wide alert SSE subscription shared via context.
 *
 * Mounting one provider in AppShell means the dashboard, the /alerts page,
 * and the global notification listener all read the SAME EventSource — no
 * duplicate connections. */

import { createContext, useContext, type ReactNode } from "react";

import { useAlertStream, type AlertStreamState } from "./sse";

const AlertStreamContext = createContext<AlertStreamState | null>(null);

export function AlertStreamProvider({ children }: { children: ReactNode }) {
  const state = useAlertStream();
  return (
    <AlertStreamContext.Provider value={state}>
      {children}
    </AlertStreamContext.Provider>
  );
}

export function useAlertStreamContext(): AlertStreamState {
  const ctx = useContext(AlertStreamContext);
  if (!ctx) {
    throw new Error(
      "useAlertStreamContext must be used within <AlertStreamProvider>",
    );
  }
  return ctx;
}
