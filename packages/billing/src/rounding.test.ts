import { describe, expect, it } from 'vitest';
import type { RoundingRule } from '@ghost-hours/core';
import { applyRoundingByScope, isRoundingIdempotent, roundMinutes, roundingNote } from './index.ts';

function rule(mode: RoundingRule['mode'], stepMinutes: number, scope: RoundingRule['scope'] = 'day'): RoundingRule {
  return { mode, stepMinutes, scope };
}

const sum = (entries: readonly { minutes: number }[]): number => entries.reduce((total, e) => total + e.minutes, 0);

describe('roundMinutes (HEU-F-23)', () => {
  it('is the identity with mode none', () => {
    expect(roundMinutes(0, rule('none', 15))).toBe(0);
    expect(roundMinutes(50, rule('none', 15))).toBe(50);
    expect(roundMinutes(617, rule('none', 60))).toBe(617);
  });

  it('rounds to the nearest step, half up', () => {
    expect(roundMinutes(50, rule('nearest', 15))).toBe(45);
    expect(roundMinutes(53, rule('nearest', 15))).toBe(60);
    expect(roundMinutes(52, rule('nearest', 15))).toBe(45);
    expect(roundMinutes(7, rule('nearest', 60))).toBe(0);
  });

  it('rounds up to the next step and never shortens', () => {
    expect(roundMinutes(50, rule('up', 15))).toBe(60);
    expect(roundMinutes(45, rule('up', 15))).toBe(45);
    expect(roundMinutes(46, rule('up', 15))).toBe(60);
    expect(roundMinutes(0, rule('up', 15))).toBe(0);
  });

  it('disables rounding on a non-positive step instead of dividing by zero', () => {
    expect(roundMinutes(50, rule('up', 0))).toBe(50);
    expect(roundMinutes(50, rule('nearest', -15))).toBe(45);
  });

  it('reports idempotence', () => {
    expect(isRoundingIdempotent(50, rule('up', 15))).toBe(true);
    expect(isRoundingIdempotent(53, rule('nearest', 15))).toBe(true);
    expect(isRoundingIdempotent(50, rule('none', 15))).toBe(true);
  });
});

describe('applyRoundingByScope (HEU-F-23)', () => {
  const items = [
    { blockId: 'b1', minutes: 50, dayKey: '2026-11-02' },
    { blockId: 'b2', minutes: 50, dayKey: '2026-11-02' },
  ];

  it('rounds each block on its own in session scope', () => {
    const rounded = applyRoundingByScope(items, rule('nearest', 15, 'session'));
    expect(rounded.map((entry) => entry.minutes)).toEqual([45, 45]);
    expect(sum(rounded)).toBe(90);
  });

  it('rounds the day total and splits it back without losing a minute', () => {
    const rounded = applyRoundingByScope(items, rule('nearest', 15, 'day'));
    expect(sum(rounded)).toBe(105);
    expect(rounded.every((entry) => entry.minutes > 0)).toBe(true);
  });

  it('rounds the whole period in total scope, across days', () => {
    const spread = [
      { blockId: 'b1', minutes: 50, dayKey: '2026-11-02' },
      { blockId: 'b2', minutes: 50, dayKey: '2026-11-03' },
    ];
    const rounded = applyRoundingByScope(spread, rule('up', 60, 'total'));
    expect(sum(rounded)).toBe(120);
  });

  it('never goes below the raw total when rounding up', () => {
    const rounded = applyRoundingByScope(items, rule('up', 15, 'day'));
    expect(sum(rounded)).toBeGreaterThanOrEqual(100);
  });

  it('ignores the input order', () => {
    const forward = applyRoundingByScope(items, rule('nearest', 15, 'day'));
    const backward = applyRoundingByScope([...items].reverse(), rule('nearest', 15, 'day'));
    expect(sum(backward)).toBe(sum(forward));
  });
});

describe('roundingNote (HEU-F-23)', () => {
  it('spells the rule out in English', () => {
    expect(roundingNote(rule('nearest', 15, 'day'), 'en')).toBe('Rounding: nearest 15 min, applied per day.');
    expect(roundingNote(rule('up', 30, 'total'), 'en')).toBe('Rounding: up to the next 30 min, applied per period.');
    expect(roundingNote(rule('none', 15, 'session'), 'en')).toBe('No rounding: durations are billed as measured.');
  });

  it('spells the rule out in French', () => {
    expect(roundingNote(rule('nearest', 15, 'day'), 'fr')).toBe(
      'Arrondi au plus proche, par pas de 15 min, appliqué par jour.',
    );
    expect(roundingNote(rule('up', 30, 'session'), 'fr')).toBe(
      'Arrondi au pas supérieur de 30 min, appliqué par séance.',
    );
    expect(roundingNote(rule('none', 15, 'day'), 'fr')).toBe(
      'Aucun arrondi : les durées sont facturées telles que mesurées.',
    );
  });
});
