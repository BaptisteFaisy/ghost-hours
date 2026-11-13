import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { ACME, NOVEMBER_2026, SETTINGS } from './fixtures.ts';
import {
  applyDailyCap,
  buildInvoiceDraft,
  dailyProportional,
  dailyThresholds,
  isRoundingIdempotent,
  lineQuantityValue,
  recalculateDraft,
  roundMinutes,
  taxFromSubtotal,
} from './index.ts';
import { arbBillingMode, arbBlocks, arbMinutes, arbRoundingMode, arbScope, arbStepMinutes } from './arbitraries.ts';

/**
 * The properties this package owns (D.12): HEU-P-08 (rounding), HEU-P-09
 * (draft totals) and HEU-P-10 (daily quantities), plus the two invariants the
 * spec states in prose: a cap of one day per day, and order independence.
 */
const RUNS = 150;
const DAILY_MODES = fc.constantFrom('daily-thresholds' as const, 'daily-proportional' as const);

describe('billing properties (fast-check)', () => {
  it('HEU-P-08: rounding up never shortens, and rounding twice changes nothing', () => {
    fc.assert(
      fc.property(arbMinutes, arbStepMinutes, arbRoundingMode, arbScope, (minutes, stepMinutes, mode, scope) => {
        const rule = { mode, stepMinutes, scope };
        const rounded = roundMinutes(minutes, rule);
        expect(isRoundingIdempotent(minutes, rule)).toBe(true);
        expect(roundMinutes(rounded, rule)).toBe(rounded);
        if (mode === 'none') expect(rounded).toBe(minutes);
        if (mode === 'up') expect(rounded).toBeGreaterThanOrEqual(minutes);
        if (mode === 'nearest') expect(Math.abs(rounded - minutes)).toBeLessThanOrEqual(stepMinutes / 2);
      }),
      { numRuns: RUNS },
    );
  });

  it('HEU-P-09: the subtotal is the sum of the lines, and the draft rebuilds from the blocks', () => {
    fc.assert(
      fc.property(arbBlocks(), arbBillingMode, fc.integer({ min: 0, max: 3_000 }), (blocks, mode, taxRateBp) => {
        const client = { ...ACME, mode };
        const draft = buildInvoiceDraft({ client, period: NOVEMBER_2026, blocks, settings: SETTINGS, taxRateBp });
        const lineSum = draft.lines.reduce((sum, line) => sum + line.amountCents, 0);
        expect(draft.subtotalCents).toBe(lineSum);
        expect(draft.taxCents).toBe(taxFromSubtotal(lineSum, taxRateBp));
        expect(draft.totalCents).toBe(draft.subtotalCents + draft.taxCents);
        const again = recalculateDraft(draft, blocks, SETTINGS);
        expect(again.subtotalCents).toBe(draft.subtotalCents);
        expect(again.totalCents).toBe(draft.totalCents);
        expect(again.lines.map((line) => line.projectId)).toEqual(draft.lines.map((line) => line.projectId));
      }),
      { numRuns: 100 },
    );
  });

});

describe('billing properties, daily modes (fast-check)', () => {
  it('HEU-P-10: a daily-thresholds day is worth exactly 0, 0.5 or 1', () => {
    fc.assert(
      fc.property(arbBlocks(), (blocks) => {
        for (const quantity of dailyThresholds(blocks, ACME, SETTINGS)) {
          expect([0, 0.5, 1]).toContain(quantity.quantityDays);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('caps a client at one day per day and ignores the input order', () => {
    fc.assert(
      fc.property(arbBlocks(), DAILY_MODES, (blocks, mode) => {
        const client = { ...ACME, mode };
        const draft = buildInvoiceDraft({ client, period: NOVEMBER_2026, blocks, settings: SETTINGS, taxRateBp: 2_000 });
        const reversed = buildInvoiceDraft({
          client,
          period: NOVEMBER_2026,
          blocks: [...blocks].reverse(),
          settings: SETTINGS,
          taxRateBp: 2_000,
        });
        expect(reversed.subtotalCents).toBe(draft.subtotalCents);
        expect(reversed.totalCents).toBe(draft.totalCents);
        const billedDays = draft.lines.reduce((sum, line) => sum + lineQuantityValue(line), 0);
        const days = new Set(dailyProportional(blocks, SETTINGS).map((day) => day.dayKey));
        expect(billedDays).toBeLessThanOrEqual(days.size + 1e-9);
        for (const quantity of applyDailyCap(dailyProportional(blocks, SETTINGS), SETTINGS)) {
          expect(quantity.quantityDays).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: 100 },
    );
  });
});
