// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { loadSampleMonth } from '@ghost-hours/fixture-sample-month';
import type { BlockStatus } from '@ghost-hours/core';
import type { AppState } from './types.ts';
import { annexFor, declaredProgress, draftFor, monthCounter, overloadedDays } from './selectors.ts';
import { loadSampleState, sampleStateAfter } from './sampleState.ts';

/**
 * The selectors are pure functions of the state: these tests load the
 * fictitious sample month through the real store and check the numbers the
 * demo promises (104 h found, 92 h declared, 12 ghost hours worth 780 €).
 */

describe('monthCounter', () => {
  it('counts the found, declared and ghost minutes of the sample month', async () => {
    const loaded = await loadSampleState();
    const sample = loadSampleMonth();
    const rows = monthCounter(loaded);
    const all = rows.find((row) => row.clientId === null);

    expect(all).toBeDefined();
    expect(all?.foundMinutes).toBe(6240);
    expect(all?.declaredMinutes).toBe(5520);
    expect(all?.ghostMinutes).toBe(720);
    expect(all?.ghostAmountCents).toBe(78000);
    expect(Object.values(sample.declaredMinutes).length).toBeGreaterThan(0);
  });

  it('gives one row per client plus the "all" row', async () => {
    const loaded = await loadSampleState();
    const rows = monthCounter(loaded);
    expect(rows.length).toBe(loaded.clients.length + 1);
    expect(rows[rows.length - 1]?.clientId).toBeNull();
  });

  it('matches the per-client expectations of the fixture', async () => {
    const loaded = await loadSampleState();
    const sample = loadSampleMonth();
    const rows = monthCounter(loaded);
    for (const [clientId, expected] of Object.entries(sample.expected.perClient)) {
      const row = rows.find((item) => item.clientId === clientId);
      expect(row?.foundMinutes).toBe(expected.foundMinutes);
      expect(row?.ghostMinutes).toBe(expected.ghostMinutes);
      expect(row?.ghostAmountCents).toBe(expected.ghostAmountCents);
    }
  });
});

describe('draftFor', () => {
  it('builds a draft labelled "Draft"', async () => {
    const loaded = await loadSampleState();
    const client = loaded.clients[0];
    expect(client).toBeDefined();
    const draft = draftFor(loaded, client?.id ?? '');
    expect(draft.draftLabel).toBe('Draft');
    expect(draft.clientId).toBe(client?.id);
  });
});

describe('annexFor', () => {
  it('returns one row per billed day, once the work is confirmed', async () => {
    const loaded = await loadSampleState();
    const client = loaded.clients[0];
    expect(client).toBeDefined();
    // Nothing is billed until the user confirms the work.
    expect(annexFor(loaded, client?.id ?? '')).toHaveLength(0);
    const block = loaded.blocks.find((item) => item.clientId === client?.id);
    expect(block).toBeDefined();
    const confirmed = await sampleStateAfter({ type: 'confirmBlock', blockId: block?.id ?? '' });
    expect(annexFor(confirmed, client?.id ?? '').length).toBeGreaterThan(0);
  });
});

describe('overloadedDays (D.6, the warning side of the caps)', () => {
  /** Two blocks of five hours on 10 November 2026, Paris time: 600 min > 420. */
  function overloadedState(base: AppState, status: BlockStatus): AppState {
    const template = base.blocks[0];
    if (template === undefined) throw new Error('the sample month has no block');
    const morning = Date.UTC(2026, 10, 10, 8, 0);
    return {
      ...base,
      blocks: [
        { ...template, id: 'ov-1', clientId: 'ov-a', start: morning, end: morning + 300 * 60_000, status },
        {
          ...template,
          id: 'ov-2',
          clientId: 'ov-b',
          start: morning + 300 * 60_000,
          end: morning + 600 * 60_000,
          status,
        },
      ],
    };
  }

  it('flags a day that carries more counted time than one working day', async () => {
    const base = await loadSampleState();
    const days = overloadedDays(overloadedState(base, 'confirmed'));
    expect(days).toHaveLength(1);
    expect(days[0]?.dayKey).toBe('2026-11-10');
    expect(days[0]?.totalMinutes).toBe(600);
    expect(days[0]?.thresholdMinutes).toBe(base.settings.dayLengthMinutes);
  });

  it('says nothing about a month that stays inside the days', async () => {
    const loaded = await loadSampleState();
    expect(overloadedDays(loaded)).toEqual([]);
  });

  it('counts neither a conflict nor a rejection', async () => {
    const base = await loadSampleState();
    expect(overloadedDays(overloadedState(base, 'rejected'))).toEqual([]);
    expect(overloadedDays(overloadedState(base, 'conflict'))).toEqual([]);
  });
});

describe('declaredProgress', () => {
  it('counts the sample month as fully declared', async () => {
    const loaded = await loadSampleState();
    const progress = declaredProgress(loaded);
    expect(progress.total).toBe(3);
    expect(progress.done).toBe(3);
    expect(progress.minutes).toBe(5520);
  });

  it('reports a partial month without pretending it is complete', async () => {
    const loaded = await loadSampleState();
    const progress = declaredProgress({ ...loaded, declaredMinutes: { acme: 1200 } });
    expect(progress.done).toBe(1);
    expect(progress.total).toBe(3);
    expect(progress.minutes).toBe(1200);
  });

  it('says nothing is declared when nothing is', async () => {
    const loaded = await loadSampleState();
    expect(declaredProgress({ ...loaded, declaredMinutes: {} }).done).toBe(0);
  });
});
