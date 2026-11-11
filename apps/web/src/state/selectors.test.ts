// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { loadSampleMonth } from '@ghost-hours/fixture-sample-month';
import { annexFor, draftFor, monthCounter } from './selectors.ts';
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
