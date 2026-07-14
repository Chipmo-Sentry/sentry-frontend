/**
 * Read-only detection-zone overlay helpers (docs/29 P1d).
 *
 * Pure geometry + presentation for drawing a camera's normalized 0-1 zone
 * polygons over the live <video>. Colours + Mongolian labels mirror the agent-pc
 * zone editor (zone_geometry.py) so a zone reads the same in both places.
 */

// NB: the agent editor merged орц+гарц into ONE tool (type `exit`, docs/30
// §3.5), so `exit` reads «Орц/Гарц» everywhere; `entrance` survives only on
// legacy plans. This map is the single source for zone styling — /live overlay
// AND /insights (FloorPlanViewport, ZoneTable) — so a zone drawn in the agent
// editor looks identical across every surface. Keyed by string because it
// covers Camera.zones types AND plan-only fixture types (furniture never
// becomes a Camera.zone).
const ZONE_STYLE: Record<string, { color: string; label: string }> = {
  exit: { color: "#E5484D", label: "Орц/Гарц" },
  shelf: { color: "#3DD56D", label: "Тавиур" },
  checkout: { color: "#E0A82E", label: "Касс" },
  entrance: { color: "#3B82F6", label: "Орц" },
  fridge: { color: "#38BDF8", label: "Хөргүүр" },
  mannequin: { color: "#F472B6", label: "Маникен" },
  furniture: { color: "#A78BFA", label: "Тавилга" },
};

const FALLBACK = { color: "#9CA3AF", label: "Зон" };

export function zoneColor(type: string): string {
  return ZONE_STYLE[type]?.color ?? FALLBACK.color;
}

export function zoneLabel(type: string): string {
  return ZONE_STYLE[type]?.label ?? FALLBACK.label;
}

/** Where the object-cover'd video image sits on the tile, in CSS pixels. The
 * <video> is `object-cover`: it scales to FILL the tile (scale = max) and crops
 * the overflow, so the drawn image is >= the tile and centered (negative offsets).
 * Identical maths to the AI box overlay — uses the video's intrinsic size so zones
 * project correctly even when no AI metadata frame has arrived yet. */
export type CoverRect = { offX: number; offY: number; drawW: number; drawH: number };

export function coverRect(
  intrinsicW: number,
  intrinsicH: number,
  cssW: number,
  cssH: number,
): CoverRect | null {
  if (intrinsicW <= 0 || intrinsicH <= 0 || cssW <= 0 || cssH <= 0) return null;
  const scale = Math.max(cssW / intrinsicW, cssH / intrinsicH);
  const drawW = intrinsicW * scale;
  const drawH = intrinsicH * scale;
  return { offX: (cssW - drawW) / 2, offY: (cssH - drawH) / 2, drawW, drawH };
}

/** Project a normalized 0-1 zone point to a CSS pixel on the tile. */
export function projectPoint(
  nx: number,
  ny: number,
  r: CoverRect,
): [number, number] {
  return [r.offX + nx * r.drawW, r.offY + ny * r.drawH];
}
