"use client";

/** App-level toast system built on the ui-kit Radix Toast primitives.
 *
 * Wrap the app once with <Toaster> (it provides both the React context and
 * the Radix provider/viewport), then call `useToast()` anywhere below it:
 *
 *   const { toast } = useToast();
 *   toast({ title: "Хадгаллаа", tone: "success" });
 */

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@chipmo-sentry/ui-kit";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ToastTone = "default" | "success" | "warning" | "danger";

interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Auto-dismiss after this many ms. Default 4000. Use 0 to keep open. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function Toaster({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((opts: ToastOptions) => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, ...opts }]);
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      <ToastProvider swipeDirection="right">
        {children}
        {items.map((t) => (
          <Toast
            key={t.id}
            tone={t.tone ?? "default"}
            duration={t.duration ?? 4000}
            onOpenChange={(open) => {
              if (!open) dismiss(t.id);
            }}
          >
            <div className="flex flex-col gap-1">
              <ToastTitle>{t.title}</ToastTitle>
              {t.description ? (
                <ToastDescription>{t.description}</ToastDescription>
              ) : null}
            </div>
            <ToastClose />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within <Toaster>");
  }
  return ctx;
}
