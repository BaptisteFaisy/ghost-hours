import { describe, expect, it } from 'vitest';
import { formatHours, formatMoney } from '@ghost-hours/core';
import {
  ACME,
  ACME_MONTH_BLOCKS,
  DECLARED_MINUTES,
  GLOBEX,
  GLOBEX_MONTH_BLOCKS,
  MIXED_STATUS_BLOCKS,
  NORTHWIND,
  OVERLOAD_BLOCKS,
  SETTINGS,
  makeBlock,
} from './fixtures.ts';
import {
  billableMinutes,
  clientDayQuantities,
  dailyProportional,
  dailyThresholds,
  hourlyQuantity,
  roundCents,
} from './index.ts';

const totalDays = (quantities: readonly { quantityDays: number }[]): number =>
  quantities.reduce((sum, quantity) => sum + quantity.quantityDays, 0);

describe('billableMinutes (HEU-F-23)', () => {
  it('counts confirmed and locked blocks only', () => {
    expect(billableMinutes(MIXED_STATUS_BLOCKS)).toBe(180);
  });

  it('ignores proposed, rejected and conflicting blocks', () => {
    const proposed = MIXED_STATUS_BLOCKS.filter((block) => block.status === 'proposed');
    expect(billableMinutes(proposed)).toBe(0);
  });
});

describe('hourlyQuantity (D.6, first row)', () => {
  it('sums the confirmed minutes of the month', () => {
    const quantity = hourlyQuantity(GLOBEX_MONTH_BLOCKS, SETTINGS, GLOBEX.rounding);
    expect(quantity.quantityMinutes).toBe(6_240);
    expect(quantity.perDay).toHaveLength(13);
    expect(quantity.perDay.every((day) => day.minutes === 480)).toBe(true);
  });

  it('applies the rounding rule per session, per day and on the period', () => {
    const blocks = [
      makeBlock({ id: 'r1', dayKey: '2026-11-02', clock: '09:00', minutes: 50, clientId: GLOBEX.id }),
      makeBlock({ id: 'r2', dayKey: '2026-11-02', clock: '10:00', minutes: 50, clientId: GLOBEX.id }),
    ];
    const session = hourlyQuantity(blocks, SETTINGS, { mode: 'up', stepMinutes: 15, scope: 'session' });
    const day = hourlyQuantity(blocks, SETTINGS, { mode: 'up', stepMinutes: 15, scope: 'day' });
    const none = hourlyQuantity(blocks, SETTINGS, { mode: 'none', stepMinutes: 15, scope: 'total' });
    expect(session.quantityMinutes).toBe(120);
    expect(day.quantityMinutes).toBe(105);
    expect(none.quantityMinutes).toBe(100);
  });
});

describe('dailyThresholds (D.6, second row, HEU-P-10)', () => {
  it('bills Acme 9.5 days for November', () => {
    const quantities = dailyThresholds(ACME_MONTH_BLOCKS, ACME, SETTINGS);
    expect(quantities).toHaveLength(10);
    expect(totalDays(quantities)).toBe(9.5);
    expect(quantities.filter((day) => day.quantityDays === 1)).toHaveLength(9);
    expect(quantities.filter((day) => day.quantityDays === 0.5)).toHaveLength(1);
  });

  it('never mixes two clients into one client total', () => {
    const quantities = dailyThresholds(OVERLOAD_BLOCKS, ACME, SETTINGS);
    expect(quantities).toHaveLength(1);
    expect(quantities[0]?.minutes).toBe(240);
    expect(quantities[0]?.quantityDays).toBe(0.5);
  });

  it('gives zero to a day below the half-day threshold', () => {
    const short = [makeBlock({ id: 'short', dayKey: '2026-11-20', clock: '09:00', minutes: 120, clientId: ACME.id })];
    expect(dailyThresholds(short, ACME, SETTINGS)[0]?.quantityDays).toBe(0);
  });

  it('takes its thresholds from the settings', () => {
    const blocks = [makeBlock({ id: 't1', dayKey: '2026-11-20', clock: '09:00', minutes: 300, clientId: ACME.id })];
    const strict = { ...SETTINGS, fullDayFromMinutes: 330 };
    expect(dailyThresholds(blocks, ACME, SETTINGS)[0]?.quantityDays).toBe(0.5);
    expect(dailyThresholds(blocks, ACME, strict)[0]?.quantityDays).toBe(0.5);
    const loose = { ...SETTINGS, fullDayFromMinutes: 240 };
    expect(dailyThresholds(blocks, ACME, loose)[0]?.quantityDays).toBe(1);
  });
});

describe('dailyProportional (D.6, third row)', () => {
  it('divides the day by its length and caps at one day', () => {
    const blocks = [
      makeBlock({ id: 'p1', dayKey: '2026-11-02', clock: '09:00', minutes: 420, clientId: ACME.id }),
      makeBlock({ id: 'p2', dayKey: '2026-11-03', clock: '09:00', minutes: 210, clientId: ACME.id }),
      makeBlock({ id: 'p3', dayKey: '2026-11-04', clock: '09:00', minutes: 480, clientId: ACME.id }),
    ];
    const quantities = dailyProportional(blocks, SETTINGS);
    expect(quantities.map((day) => day.quantityDays)).toEqual([1, 0.5, 1]);
    expect(quantities.map((day) => day.capped)).toEqual([false, false, true]);
    expect(quantities[2]?.minutes).toBe(480);
  });

  it('follows the day length from the settings', () => {
    const blocks = [makeBlock({ id: 'p4', dayKey: '2026-11-02', clock: '09:00', minutes: 180, clientId: ACME.id })];
    expect(dailyProportional(blocks, SETTINGS)[0]?.quantityDays).toBe(0.429);
    expect(dailyProportional(blocks, { ...SETTINGS, dayLengthMinutes: 360 })[0]?.quantityDays).toBe(0.5);
  });

  it('is what clientDayQuantities returns for a proportional client', () => {
    const proportional = { ...ACME, mode: 'daily-proportional' as const };
    const quantities = clientDayQuantities(ACME_MONTH_BLOCKS, proportional, SETTINGS);
    expect(totalDays(quantities)).toBe(9.429);
    expect(clientDayQuantities(ACME_MONTH_BLOCKS, ACME, SETTINGS)).toHaveLength(10);
  });
});

describe('the month counter (D.6 / D.7 P4)', () => {
  it('finds 104 h, 12 h of ghosts and 780 € at 65 €/h', () => {
    const found = billableMinutes(GLOBEX_MONTH_BLOCKS);
    const ghostMinutes = found - DECLARED_MINUTES;
    const ghostAmountCents = roundCents((ghostMinutes * GLOBEX.rateCents) / 60);
    expect(formatHours(found, 'en')).toBe('104.0 h');
    expect(formatHours(DECLARED_MINUTES, 'en')).toBe('92.0 h');
    expect(formatHours(ghostMinutes, 'en')).toBe('12.0 h');
    expect(ghostAmountCents).toBe(78_000);
    expect(formatMoney(ghostAmountCents, 'EUR', 'en')).toContain('780');
    expect(formatMoney(ghostAmountCents, 'EUR', 'fr')).toContain('780');
  });

  it('keeps Northwind out of Globex hours', () => {
    const northwind = [makeBlock({ id: 'nw', dayKey: '2026-11-02', clock: '09:00', minutes: 120, clientId: NORTHWIND.id })];
    const quantity = hourlyQuantity([...GLOBEX_MONTH_BLOCKS, ...northwind], SETTINGS, GLOBEX.rounding);
    expect(quantity.quantityMinutes).toBe(6_360);
  });
});
