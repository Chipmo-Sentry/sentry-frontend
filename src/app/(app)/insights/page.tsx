"use client";

import { Card, CardContent, Select, Spinner } from "@chipmo-sentry/ui-kit";
import { BarChart3, Store } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  ANALYTICS_RANGES,
  RangeTabs,
  StoreAnalytics,
} from "@/components/stores/StoreAnalytics";
import { stores as storesApi } from "@/lib/api";
import type { StorePublic } from "@/lib/types";

/**
 * /insights — top-level analytics destination (sidebar). Picks a store (defaults
 * to the first) and renders the same <StoreAnalytics> dashboard the per-store
 * /stores/{id}/insights route uses. A store with no plan/data still renders — the
 * dashboard shows its own "waiting for data" state.
 */
export default function InsightsPage() {
  const [stores, setStores] = useState<StorePublic[] | null>(null);
  const [storeId, setStoreId] = useState<string>("");
  const [hours, setHours] = useState(24);

  // Store + range live in the URL (?store=…&h=…) so a refresh or a shared
  // link lands on the same view instead of resetting to store #1 / 24h.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const h = Number(q.get("h"));
    if (ANALYTICS_RANGES.some((r) => r.hours === h)) setHours(h);
    const urlStore = q.get("store");
    storesApi.list().then(
      (list) => {
        setStores(list);
        const preferred = urlStore && list.find((s) => s.id === urlStore);
        if (preferred) setStoreId(preferred.id);
        else if (list[0]) setStoreId(list[0].id);
      },
      () => setStores([]),
    );
  }, []);

  useEffect(() => {
    if (!storeId) return;
    const q = new URLSearchParams(window.location.search);
    q.set("store", storeId);
    q.set("h", String(hours));
    window.history.replaceState(null, "", `?${q.toString()}`);
  }, [storeId, hours]);

  return (
    <div className="p-4 md:p-8">
      {/* Header wraps into stacked rows on phones: title, then the store
          picker (full width), then the full-width range tabs. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
          <h1 className="flex items-center gap-2 text-xl font-semibold md:text-2xl">
            <BarChart3 className="h-6 w-6 shrink-0 text-(--color-primary)" />
            Аналитик
          </h1>
          <p className="text-sm text-(--color-muted-foreground)">
            Дэлгүүрийн харилцагчийн урсгал, зогсох дулаан, хүн тоолох
          </p>
        </div>

        {stores && stores.length > 1 ? (
          <label className="flex w-full items-center gap-2 text-sm sm:w-auto">
            <Store className="h-4 w-4 shrink-0 text-(--color-muted-foreground)" />
            <Select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="h-9 w-full sm:w-auto sm:min-w-44"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        {storeId ? <RangeTabs hours={hours} onChange={setHours} /> : null}
      </div>

      {stores === null ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      ) : stores.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Store className="h-8 w-8 text-(--color-muted-foreground)" />
            <div className="text-sm font-medium">Дэлгүүр бүртгэгдээгүй байна</div>
            <p className="max-w-sm text-sm text-(--color-muted-foreground)">
              Эхлээд{" "}
              <Link href="/stores" className="text-(--color-primary) underline">
                Дэлгүүр
              </Link>{" "}
              хэсэгт дэлгүүр нэмж, план зураг зурсны дараа аналитик энд харагдана.
            </p>
          </CardContent>
        </Card>
      ) : storeId ? (
        <StoreAnalytics storeId={storeId} hours={hours} />
      ) : null}
    </div>
  );
}
