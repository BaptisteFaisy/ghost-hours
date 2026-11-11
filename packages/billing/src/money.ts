import type { BasisPoints, Cents, Minutes } from '@ghost-hours/core';

/**
 * Money is an integer number of cents everywhere (HEU-P-09). A quantity is
 * fractional (hours, days), so every conversion to cents goes through exactly
 * one documented rule: **round half away from zero**, on the magnitude.
 *
 * Why half away from zero and not `Math.round` on the signed value: a negative
 * amount (a credit line) must round symmetrically, otherwise `-0.5` and `0.5`
 * would not be the same distance from zero. Why round at all: `subtotalCents`
 * is the exact sum of the rounded lines, so no half-cent may survive inside a
 * line — it would reappear as a cent of drift between the lines and the total.
 */
export function roundCents(value: number): Cents {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** `quantity(h) * hourlyRate`, quantity taken from the billed minutes. */
export function amountFromHours(minutes: Minutes, hourlyRateCents: Cents): Cents {
  return roundCents((minutes * hourlyRateCents) / 60);
}

/** `quantity(days) * dayRate`. Days are 0, 0.5, 1 or a proportional share. */
export function amountFromDays(days: number, dayRateCents: Cents): Cents {
  return roundCents(days * dayRateCents);
}

/** `round(subtotal * taxRateBp / 10000)`, the only tax formula (HEU-P-09). */
export function taxFromSubtotal(subtotalCents: Cents, taxRateBp: BasisPoints): Cents {
  return roundCents((subtotalCents * taxRateBp) / 10_000);
}
