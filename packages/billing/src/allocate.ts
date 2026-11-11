/**
 * Integer allocation (largest remainder / Hamilton method).
 *
 * Billing constantly has to split a *rounded* total back onto the items that
 * produced it: the rounded minutes of a day across its blocks, the day quantity
 * of a day across its projects. Splitting proportionally with floats would lose
 * or invent units, so every split here is exact by construction:
 *
 * 1. each key gets `floor(total * weight / sum(weights))`;
 * 2. the leftover units go, one each, to the largest fractional parts;
 * 3. ties are broken on the key, never on input order — the result does not
 *    depend on the order the caller collected its items in (HEU-F-16).
 */
export interface WeightedKey {
  readonly key: string;
  readonly weight: number;
}

export interface Allocation {
  readonly key: string;
  readonly units: number;
}

function compareKeys(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function allocateUnits(totalUnits: number, weights: readonly WeightedKey[]): readonly Allocation[] {
  const total = Number.isFinite(totalUnits) ? Math.max(0, Math.round(totalUnits)) : 0;
  const keys = [...weights].sort((a, b) => compareKeys(a.key, b.key));
  if (keys.length === 0) return [];
  const weightSum = keys.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (weightSum <= 0) {
    return keys.map((entry, index) => ({ key: entry.key, units: index === 0 ? total : 0 }));
  }
  const shares = keys.map((entry) => {
    const exact = (total * Math.max(0, entry.weight)) / weightSum;
    const units = Math.floor(exact);
    return { key: entry.key, units, fraction: exact - units };
  });
  let leftover = total - shares.reduce((sum, share) => sum + share.units, 0);
  const byFraction = [...shares].sort((a, b) => b.fraction - a.fraction || compareKeys(a.key, b.key));
  for (const share of byFraction) {
    if (leftover <= 0) break;
    share.units += 1;
    leftover -= 1;
  }
  return shares.map((share) => ({ key: share.key, units: share.units }));
}
