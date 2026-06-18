"use client";

import { useParams, useSearchParams } from "next/navigation";

import { StageDetail } from "@/components/pipeline/StageDetail";
import type { StageKey } from "@/lib/pipeline";

/** Per-stage diagnostic detail (docs/26): YOLO / Tracker / VLM / Cloud ingest /
 * Camera / Decision — per camera + per node, with the actual problem spelled out. */
export default function StageDetailPage() {
  const params = useParams<{ stage: string }>();
  const search = useSearchParams();
  return (
    <StageDetail
      stageKey={params.stage as StageKey}
      cameraFilter={search.get("camera")}
    />
  );
}
