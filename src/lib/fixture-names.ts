import type { FloorFixture, FloorPlan } from "@/lib/types";
import { zoneLabel } from "@/lib/zone-overlay";

/**
 * ONE display name per plan fixture, shared by every surface that names a
 * zone (plan labels, zone activity table, zone flow table) so «Тавиур 2» on
 * the drawing is the same shelf as «Тавиур 2» in the tables.
 *
 * Rule: the operator's label from the agent plan editor («Архины тавиур»)
 * when given; otherwise the type label, numbered per type in DRAWING order
 * (Тавиур 1, Тавиур 2…) — and only numbered when the type has more than one
 * unnamed fixture, so a lone «Касс» stays «Касс». Named fixtures never
 * consume a number.
 *
 * Why drawing order: the backend numbers flow nodes by the fixture's global
 * index (so «Тавиур 3» could be the 3rd fixture, not the 3rd shelf) and the
 * zone table used to number by activity rank (so «Тавиур 1» changed identity
 * with every window). Drawing order is the only stable, plan-visible one.
 *
 * Keys: the fixture id, plus the backend's two id-less fallbacks
 * (`zone{i}` for the zone table, `z{i}` for flow nodes) so legacy plans whose
 * fixtures carry no id still resolve.
 */
export function fixtureNames(plan: FloorPlan): Map<string, string> {
  const unnamed: Record<string, number> = {};
  for (const f of plan.fixtures) {
    if (!f.label) unnamed[f.type] = (unnamed[f.type] ?? 0) + 1;
  }
  const seen: Record<string, number> = {};
  const out = new Map<string, string>();
  plan.fixtures.forEach((f, i) => {
    let name = f.label || "";
    if (!name) {
      seen[f.type] = (seen[f.type] ?? 0) + 1;
      name = zoneLabel(f.type) + ((unnamed[f.type] ?? 0) > 1 ? ` ${seen[f.type]}` : "");
    }
    if (f.id) out.set(f.id, name);
    out.set(`zone${i}`, name);
    out.set(`z${i}`, name);
  });
  return out;
}

/** Name of the i-th fixture of the plan the map was built from. */
export function fixtureName(names: Map<string, string>, f: FloorFixture, i: number): string {
  return (f.id ? names.get(f.id) : undefined) ?? names.get(`z${i}`) ?? zoneLabel(f.type);
}
