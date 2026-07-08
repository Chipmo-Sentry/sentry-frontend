"use client";

import { Card, CardContent, Spinner } from "@chipmo-sentry/ui-kit";
import { BarChart3, Store } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { RangeTabs, StoreAnalytics } from "@/components/stores/StoreAnalytics";
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

  useEffect(() => {
    storesApi.list().then(
      (list) => {
        setStores(list);
        if (list[0]) setStoreId(list[0].id);
      },
      () => setStores([]),
    );
  }, []);

  return (
    <div className="p-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <BarChart3 className="h-6 w-6 text-(--color-primary)" />
            Аналитик
          </h1>
          <p className="text-sm text-(--color-muted-foreground)">
            Дэлгүүрийн харилцагчийн урсгал, зогсох дулаан, хүн тоолох
          </p>
        </div>

        {stores && stores.length > 1 ? (
          <label className="flex items-center gap-2 text-sm">
            <Store className="h-4 w-4 text-(--color-muted-foreground)" />
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="rounded-lg border border-(--color-border) bg-(--color-background) px-3 py-1.5 text-sm"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
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
