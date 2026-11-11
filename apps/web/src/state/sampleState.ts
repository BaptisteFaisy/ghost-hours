// Shared test harness: loads the fictitious month through the real store.
import { createElement } from 'react';
import { act, render } from '@testing-library/react';
import { AppProvider, useApp, useDispatch } from './store.tsx';
import type { AppAction, AppState } from './types.ts';

interface Probe {
  state: AppState;
  dispatch: (action: AppAction) => void;
}

const probe: Probe = {
  state: null as unknown as AppState,
  dispatch: () => undefined,
};

function ProbeComponent(): JSX.Element {
  probe.state = useApp();
  probe.dispatch = useDispatch();
  return createElement('p', null, probe.state.status);
}

/**
 * Load the sample month through the real store and hand back the state.
 * Used by every selector-level test so the numbers checked are the numbers the
 * application computes, not a fixture assembled by hand.
 */
export async function loadSampleState(): Promise<AppState> {
  render(createElement(AppProvider, null, createElement(ProbeComponent)));
  await act(async () => {
    probe.dispatch({ type: 'loadSampleMonth' });
  });
  return probe.state;
}

/** Load the sample month, then run one action and return the new state. */
export async function sampleStateAfter(action: AppAction): Promise<AppState> {
  await loadSampleState();
  await act(async () => {
    probe.dispatch(action);
  });
  return probe.state;
}
