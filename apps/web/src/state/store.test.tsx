// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppProvider, useApp, useDispatch } from './store.tsx';
import type { AppAction, AppState } from './types.ts';

/**
 * The store tests: the app must be able to load the sample month, confirm a
 * block and switch language without a reload.
 */

let lastState: AppState = null as unknown as AppState;
let dispatch: (action: AppAction) => void = () => undefined;

function Probe(): JSX.Element {
  lastState = useApp();
  dispatch = useDispatch();
  return <p>{lastState.status}</p>;
}

function renderStore(): void {
  render(
    <AppProvider>
      <Probe />
    </AppProvider>,
  );
}

describe('the store', () => {
  it('loads the sample month', async () => {
    renderStore();
    await act(async () => {
      dispatch({ type: 'loadSampleMonth' });
    });
    expect(lastState.status).toBe('ready');
    expect(lastState.blocks.length).toBeGreaterThanOrEqual(10);
  });

  it('confirms a block', async () => {
    renderStore();
    await act(async () => {
      dispatch({ type: 'loadSampleMonth' });
    });
    const blockId = lastState.blocks[0]?.id ?? '';
    expect(blockId).not.toBe('');
    await act(async () => {
      dispatch({ type: 'confirmBlock', blockId });
    });
    expect(lastState.blocks.find((block) => block.id === blockId)?.status).toBe('confirmed');
  });

  it('switches the language without a reload', async () => {
    renderStore();
    await act(async () => {
      dispatch({ type: 'setLocale', locale: 'fr' });
    });
    expect(lastState.locale).toBe('fr');
  });
});
