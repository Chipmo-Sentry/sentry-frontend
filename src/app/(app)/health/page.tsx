"use client";

import { HealthOverview } from "@/components/health/HealthOverview";

/** Fleet health rollup (docs/26): "what is healthy right now" — node + camera
 * topology, status counters, and recent up/down events. */
export default function HealthPage() {
  return <HealthOverview />;
}
