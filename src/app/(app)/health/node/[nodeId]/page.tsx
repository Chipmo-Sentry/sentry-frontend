"use client";

import { useParams } from "next/navigation";

import { NodeDetail } from "@/components/health/NodeDetail";

/** Node detail (docs/26): live gauges, GPU/VRAM/FPS history, provider apply
 * state, GPU-starvation banner, and this node's cameras. */
export default function NodeDetailPage() {
  const params = useParams<{ nodeId: string }>();
  return <NodeDetail nodeId={decodeURIComponent(params.nodeId)} />;
}
