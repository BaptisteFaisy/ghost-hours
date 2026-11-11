import { describe, expect, it } from 'vitest';
import type { DayQuantity } from './index.ts';
import { ACME, NORTHWIND, OVERLOAD_BLOCKS, SETTINGS, makeBlock } from './fixtures.ts';
import { applyDailyCap, dailyProportional, detectOverloadedDays } from './index.ts';

const day = (dayKey: string, minutes: number, quantityDays: number, capped = false): DayQuantity => ({
  dayKey,
  minutes,
  quantityDays,
  capped,
});

describe('applyDailyCap (D.6, cap)', () => {
  it('never bills more than one day for one calendar day', () => {
    const capped = applyDailyCap([day('2026-11-02', 900, 2.14), day('2026-11-03', 210, 0.5)], SETTINGS);
    expect(capped[0]?.quantityDays).toBe(1);
    expect(capped[0]?.capped).toBe(true);
    expect(capped[0]?.minutes).toBe(900);
    expect(capped[1]?.quantityDays).toBe(0.5);
    expect(capped[1]?.capped).toBe(false);
  });

  it('clamps negative quantities to zero', () => {
    expect(applyDailyCap([day('2026-11-02', 0, -0.5)], SETTINGS)[0]?.quantityDays).toBe(0);
  });

  it('caps what the proportional mode produced', () => {
    const blocks = [
      makeBlock({ id: 'cap-1', dayKey: '2026-11-02', clock: '09:00', minutes: 480, clientId: ACME.id }),
      makeBlock({ id: 'cap-2', dayKey: '2026-11-02', clock: '17:00', minutes: 240, clientId: ACME.id }),
    ];
    const capped = applyDailyCap(dailyProportional(blocks, SETTINGS), SETTINGS);
    expect(capped[0]?.quantityDays).toBe(1);
    expect(capped[0]?.minutes).toBe(720);
  });

  it('leaves a day that is already within the cap untouched', () => {
    const quantities = [day('2026-11-04', 300, 0.714)];
    expect(applyDailyCap(quantities, SETTINGS)).toEqual(quantities);
  });
});

describe('detectOverloadedDays (D.6, warning)', () => {
  it('warns when all clients together exceed one working day', () => {
    const warnings = detectOverloadedDays(OVERLOAD_BLOCKS, SETTINGS);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toEqual({ dayKey: '2026-11-17', totalMinutes: 510, thresholdMinutes: 420 });
  });

  it('stays quiet on a normal day', () => {
    const blocks = [
      makeBlock({ id: 'quiet-1', dayKey: '2026-11-18', clock: '09:00', minutes: 240, clientId: ACME.id }),
      makeBlock({ id: 'quiet-2', dayKey: '2026-11-18', clock: '13:00', minutes: 180, clientId: NORTHWIND.id }),
    ];
    expect(detectOverloadedDays(blocks, SETTINGS)).toEqual([]);
  });

  it('ignores blocks that are not billable', () => {
    const blocks = [
      ...OVERLOAD_BLOCKS,
      makeBlock({ id: 'ghost', dayKey: '2026-11-17', clock: '18:00', minutes: 300, clientId: ACME.id, status: 'proposed' }),
    ];
    expect(detectOverloadedDays(blocks, SETTINGS)).toHaveLength(1);
    expect(detectOverloadedDays(blocks, SETTINGS)[0]?.totalMinutes).toBe(510);
  });

  it('reports one warning per overloaded day, in day order', () => {
    const blocks = [
      makeBlock({ id: 'late', dayKey: '2026-11-20', clock: '08:00', minutes: 500, clientId: ACME.id }),
      makeBlock({ id: 'early', dayKey: '2026-11-19', clock: '08:00', minutes: 500, clientId: ACME.id }),
    ];
    expect(detectOverloadedDays(blocks, SETTINGS).map((warning) => warning.dayKey)).toEqual([
      '2026-11-19',
      '2026-11-20',
    ]);
  });
});
