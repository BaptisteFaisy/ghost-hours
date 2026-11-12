// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { loadRealMonth } from '@ghost-hours/fixture-real-month';
import { AppProvider, useApp, useDispatch } from './store.tsx';
import type { AppAction, AppState } from './types.ts';

/**
 * The reducer on the real month: one dispatch of `importRealMonth` must land
 * the app in the same figures `fixtures/real-month/real-month.test.ts` locks
 * (21 blocks, 7 contradictions…). The numbers are read from the fixture's own
 * `expected`, never copied here, so this test cannot drift from the data.
 */

let lastState: AppState = null as unknown as AppState;
let dispatch: (action: AppAction) => void = () => undefined;

function Probe(): JSX.Element {
  lastState = useApp();
  dispatch = useDispatch();
  return <p>{lastState.status}</p>;
}

describe('the store on the real month', () => {
  afterEach(cleanup);

  it('loads October 2026 with its provenance, blocks and contradictions', async () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    );
    const month = loadRealMonth();
    await act(async () => {
      dispatch({ type: 'importRealMonth', month });
    });
    expect(lastState.status).toBe('ready');
    expect(lastState.datasetKind).toBe('real');
    expect(lastState.evidence.length).toBe(month.expected.evidenceCount);
    // `expected.blockCount` counts the blocks a reader reviews: the fixture
    // test excludes the conflict/rejected statuses, so this test does too.
    const counted = lastState.blocks.filter(
      (block) => block.status !== 'conflict' && block.status !== 'rejected',
    );
    expect(counted).toHaveLength(month.expected.blockCount);
    expect(lastState.conflicts).toHaveLength(month.expected.conflictCount);
    expect(lastState.importReport[0]).toContain('real: ');
  });
});
