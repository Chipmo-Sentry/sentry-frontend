"use client";

import { PipelineCanvas } from "@/components/pipeline/PipelineCanvas";

/**
 * Pipeline Canvas (docs/26) — the customer-facing home. One legible view of the
 * whole Camera → YOLO → ByteTrack → rule engine → VLM → decision flow, wired so
 * a broken hop is localized to one stage instead of hiding in node-local logs.
 */
export default function PipelinePage() {
  return <PipelineCanvas />;
}
