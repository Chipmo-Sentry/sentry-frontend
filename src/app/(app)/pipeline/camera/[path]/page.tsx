"use client";

import { useParams } from "next/navigation";

import { CameraLane } from "@/components/pipeline/CameraLane";

/** Single-camera pipeline lane (docs/26): video + overlay, the 6 stages
 * vertical, the per-person behavior breakdown, and a per-track table. */
export default function CameraLanePage() {
  const params = useParams<{ path: string }>();
  return <CameraLane path={decodeURIComponent(params.path)} />;
}
