import type { Minutes, RoundingMode, RoundingRule, RoundingScope, SupportedLocale } from '@ghost-hours/core';
import { allocateUnits } from './allocate.ts';

/**
 * Rounding (HEU-F-23, HEU-P-08).
 *
 * A client's rule has two axes: the *mode* (`none`, `nearest`, `up`) and the
 * *scope* (`session`, `day`, `total`). `roundMinutes` handles the mode; the
 * scope is applied by `applyRoundingByScope`, which splits a rounded group
 * total back onto its blocks without losing a single minute.
 */

/** One block's duration, tagged with the day and the block it belongs to. */
export interface ScopedMinutes {
  readonly minutes: Minutes;
  readonly dayKey: string;
  readonly blockId: string;
}

export interface BlockMinutes {
  readonly blockId: string;
  readonly minutes: Minutes;
}

export const ROUNDING_MODES: readonly RoundingMode[] = ['none', 'nearest', 'up'];
export const ROUNDING_SCOPES: readonly RoundingScope[] = ['session', 'day', 'total'];

/**
 * Round one duration. `up` always gives at least the raw duration (HEU-P-08);
 * `nearest` never moves by more than half a step; a step of zero or less
 * disables rounding rather than dividing by zero.
 */
export function roundMinutes(minutes: Minutes, rule: RoundingRule): Minutes {
  const step = Math.abs(rule.stepMinutes);
  if (rule.mode === 'none' || !Number.isFinite(step) || step <= 0 || !Number.isFinite(minutes)) {
    return minutes;
  }
  // The epsilon keeps an already-rounded value from climbing a step because of
  // floating point noise (`3.0000000000000004` must not become 4).
  const ratio = minutes / step;
  const steps = rule.mode === 'up' ? Math.ceil(ratio - 1e-9) : Math.round(ratio);
  const rounded = steps * step;
  // `Math.ceil(-1e-9)` is `-0`; a duration of zero is zero, never minus zero.
  return rounded === 0 ? 0 : rounded;
}

/** Rounding twice must equal rounding once (HEU-P-08). */
export function isRoundingIdempotent(minutes: Minutes, rule: RoundingRule): boolean {
  const once = roundMinutes(minutes, rule);
  return roundMinutes(once, rule) === once;
}

interface Indexed extends ScopedMinutes {
  readonly index: number;
}

function groupForScope(items: readonly Indexed[], scope: RoundingScope): readonly (readonly Indexed[])[] {
  if (scope !== 'day') return [items];
  const buckets = new Map<string, Indexed[]>();
  for (const item of items) {
    const bucket = buckets.get(item.dayKey);
    if (bucket) bucket.push(item);
    else buckets.set(item.dayKey, [item]);
  }
  return [...buckets.keys()].sort().map((dayKey) => buckets.get(dayKey) ?? []);
}

function distribute(group: readonly Indexed[], rule: RoundingRule, out: Map<number, Minutes>): void {
  const total = group.reduce((sum, item) => sum + item.minutes, 0);
  const target = roundMinutes(total, rule);
  const weights = group.map((item, position) => ({ key: String(position), weight: item.minutes }));
  const allocation = new Map(allocateUnits(target, weights).map((entry) => [entry.key, entry.units]));
  group.forEach((item, position) => out.set(item.index, allocation.get(String(position)) ?? item.minutes));
}

/**
 * Apply a rule to a set of block durations. `session` rounds each block on its
 * own; `day` and `total` round the group sum and split it back proportionally,
 * so the sum of the returned minutes is exactly the rounded group total.
 */
export function applyRoundingByScope(
  items: readonly ScopedMinutes[],
  rule: RoundingRule,
): readonly BlockMinutes[] {
  const indexed: readonly Indexed[] = items.map((item, index) => ({ ...item, index }));
  if (rule.scope === 'session') {
    return indexed.map((item) => ({ blockId: item.blockId, minutes: roundMinutes(item.minutes, rule) }));
  }
  const rounded = new Map<number, Minutes>();
  for (const group of groupForScope(indexed, rule.scope)) distribute(group, rule, rounded);
  return indexed.map((item) => ({
    blockId: item.blockId,
    minutes: rounded.get(item.index) ?? roundMinutes(item.minutes, rule),
  }));
}

const SCOPE_EN: Record<RoundingScope, string> = { session: 'session', day: 'day', total: 'period' };
const SCOPE_FR: Record<RoundingScope, string> = { session: 'séance', day: 'jour', total: 'période' };

/** The rule, spelled out, as printed on the draft (HEU-F-23). */
export function roundingNote(rule: RoundingRule, locale: SupportedLocale): string {
  const step = Math.abs(rule.stepMinutes);
  const scope = locale === 'fr' ? SCOPE_FR[rule.scope] : SCOPE_EN[rule.scope];
  if (rule.mode === 'none' || !Number.isFinite(step) || step <= 0) {
    return locale === 'fr'
      ? 'Aucun arrondi : les durées sont facturées telles que mesurées.'
      : 'No rounding: durations are billed as measured.';
  }
  if (locale === 'fr') {
    const mode = rule.mode === 'up' ? `au pas supérieur de ${step} min` : `au plus proche, par pas de ${step} min`;
    return `Arrondi ${mode}, appliqué par ${scope}.`;
  }
  const mode = rule.mode === 'up' ? `up to the next ${step} min` : `nearest ${step} min`;
  return `Rounding: ${mode}, applied per ${scope}.`;
}
