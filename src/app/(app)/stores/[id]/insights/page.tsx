"use client";

import { Button } from "@chipmo-sentry/ui-kit";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { RangeTabs, StoreAnalytics } from "@/components/stores/StoreAnalytics";
import { stores } from "@/lib/api";
import type { StorePublic } from "@/lib/types";

/**
 * /stores/{id}/insights — the analytics dashboard for one store, reached from
 * the store list. The same dashboard also lives at the top-level sidebar route
 * /insights (with a store picker); both render <StoreAnalytics>.
 */
export default function StoreInsightsPage() {
  const params = useParams<{ id: string }>();
  const storeId = params.id;
  const [store, setStore] = useState<StorePublic | null>(null);
  const [hours, setHours] = useState(24);

  useEffect(() => {
    stores.get(storeId).then(setStore, () => setStore(null));
  }, [storeId]);

  return (
    <div className="p-8">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" asChild>
          <Link href="/stores">
            <ArrowLeft className="h-4 w-4" />
            Дэлгүүр
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">
            {store ? `${store.name} — Аналитик` : "Аналитик"}
          </h1>
          <p className="text-sm text-(--color-muted-foreground)">
            Дэлгүүрийн харилцагчийн урсгал, зогсох дулаан, хүн тоолох
          </p>
        </div>
        <div className="ml-auto">
          <RangeTabs hours={hours} onChange={setHours} />
        </div>
      </div>

      <StoreAnalytics storeId={storeId} hours={hours} />
    </div>
  );
}
