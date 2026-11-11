// @vitest-environment jsdom
import { createElement } from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { loadSampleMonth } from '@ghost-hours/fixture-sample-month';
import { AppProvider, useApp, useDispatch } from './store.tsx';
import { annexFor, draftFor, monthCounter } from './selectors.ts';
import type { AppAction, AppState } from './types.ts';

/**
 * The selectors are pure functions of the state: these tests load the
 * fictitious sample month through the real store and check the numbers the
 * demo promises (104 h found, 92 h declared, 12 ghost hours worth 780 €).
 */

let state: AppState = null as unknown as AppState;
let dispatch: (action: AppAction) => void = () => undefined;

function Probe(): JSX.Element {
  state = useApp();
  dispatch = useDispatch();
  return createElement('p', null, state.status);
}

/** Load the sample month through the store and return the resulting state. */
async function loadSample(): Promise<AppState> {
  render(createElement(AppProvider, null, createElement(Probe)));
  await act(async () => {
    dispatch({ type: 'loadSampleMonth' });
  });
  return state;
}

describe('monthCounter', () => {
  it('counts the found, declared and ghost minutes of the sample month', async () => {
    const loaded = await loadSample();
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
    const loaded = await loadSample();
    const rows = monthCounter(loaded);
    expect(rows.length).toBe(loaded.clients.length + 1);
    expect(rows[rows.length - 1]?.clientId).toBeNull();
  });

  it('matches the per-client expectations of the fixture', async () => {
    const loaded = await loadSample();
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
    const loaded = await loadSample();
    const client = loaded.clients[0];
    expect(client).toBeDefined();
    const draft = draftFor(loaded, client?.id ?? '');
    expect(draft.draftLabel).toBe('Draft');
    expect(draft.clientId).toBe(client?.id);
  });
});

describe('annexFor', () => {
  it('returns one row per billed day, once the work is confirmed', async () => {
    const loaded = await loadSample();
    const client = loaded.clients[0];
    expect(client).toBeDefined();
    // Nothing is billed until the user confirms the work.
    expect(annexFor(loaded, client?.id ?? '')).toHaveLength(0);
    const block = loaded.blocks.find((item) => item.clientId === client?.id);
    expect(block).toBeDefined();
    await act(async () => {
      dispatch({ type: 'confirmBlock', blockId: block?.id ?? '' });
    });
    expect(annexFor(state, client?.id ?? '').length).toBeGreaterThan(0);
  });
});
