import { describe, expect, it } from 'vitest';
import { resolveSettings } from '@ghost-hours/core';
import { sessionize } from './algorithm.ts';
import { CLIENTS, TZ, at, commit } from './test-support.ts';

/**
 * The day's assumed budget (the anti-inflation rule).
 *
 * The assumed lead-in answers "you were working before your first commit". A
 * normal day asks that question twice — before the morning commit and before the
 * one after lunch — and both are legitimate. What is not legitimate is asking
 * it again every ninety minutes: that is a way to *add* time, not a way to
 * record it. The day's assumed minutes may not exceed one full lead-in.
 */

const base = { clients: CLIENTS, settings: resolveSettings({ timeZone: TZ }) };

describe('the assumed budget of a day', () => {
  it('keeps both lead-ins of a normal day with a long break', () => {
    // 09:00 and 14:00: a five-hour gap, so two sessions, two assumed starts.
    const result = sessionize({ ...base, evidence: [commit('c1', at(3, 9)), commit('c2', at(3, 14))] });
    const assumed = result.blocks.reduce((sum, block) => sum + block.assumedLeadInMinutes, 0);
    expect(assumed).toBe(60);
  });

  it('refuses to farm more than one full lead-in in a day', () => {
    // Eight commits, one every ninety-one minutes: eight sessions, eight
    // thirty-minute mornings — unless the day has a budget.
    const evidence = Array.from({ length: 8 }, (_, index) =>
      commit(`c${index}`, at(3, 9, 0) + index * 91 * 60_000),
    );
    const result = sessionize({ ...base, evidence });
    const assumed = result.blocks.reduce((sum, block) => sum + block.assumedLeadInMinutes, 0);
    expect(assumed).toBeLessThanOrEqual(base.settings.leadInMaxMinutes);
    expect(assumed).toBeLessThan(8 * base.settings.leadInDefaultMinutes);
  });

  it('says which constraint shortened the lead-in', () => {
    // Two commits per session, so each session proves thirty minutes and stays
    // billable even when its assumed start is taken back.
    // Two commits thirty minutes apart, then a ninety-one minute gap: five
    // sessions of proven work in one day.
    const evidence = Array.from({ length: 10 }, (_, index) =>
      commit(`c${index}`, at(3, 9, 0) + Math.floor(index / 2) * 121 * 60_000 + (index % 2) * 30 * 60_000),
    );
    const result = sessionize({ ...base, evidence });
    const capped = result.blocks.find(
      (block) => block.reason?.kind === 'assumed' && block.reason.boundedBy === 'day-cap',
    );
    expect(capped).toBeDefined();
    expect(capped?.assumedLeadInMinutes).toBeLessThan(base.settings.leadInDefaultMinutes);
  });

  it('gives the budget back on the next day', () => {
    const first = Array.from({ length: 6 }, (_, index) =>
      commit(`a${index}`, at(3, 9, 0) + index * 91 * 60_000),
    );
    const second = Array.from({ length: 6 }, (_, index) =>
      commit(`b${index}`, at(4, 9, 0) + index * 91 * 60_000),
    );
    const result = sessionize({ ...base, evidence: [...first, ...second] });
    const byDay = new Map<string, number>();
    for (const block of result.blocks) {
      const key = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(block.start));
      byDay.set(key, (byDay.get(key) ?? 0) + block.assumedLeadInMinutes);
    }
    expect(byDay.size).toBe(2);
    for (const minutes of byDay.values()) {
      expect(minutes).toBeLessThanOrEqual(base.settings.leadInMaxMinutes);
    }
  });
});
