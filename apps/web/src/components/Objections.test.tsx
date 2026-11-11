// @vitest-environment jsdom
import { useEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { AppProvider, useApp, useDispatch } from '../state/store.tsx';
import { I18nProvider } from '../i18n/index.ts';
import { draftFor } from '../state/selectors.ts';
import { Objections } from './Objections.tsx';
import { LoadSampleMonth } from './sampleMonth.tsx';
import { clearBrowserStorage, stubBrowserStorage } from './testSupport.ts';

/**
 * The devil's advocate panel (idea I-15): what a client could argue against
 * the draft, and how well it would hold, driven by the real fictitious month.
 */

/** Confirms every proposed block of the first client once the month is loaded. */
function ConfirmFirstClient(): null {
  const state = useApp();
  const dispatch = useDispatch();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || state.status !== 'ready') return;
    const client = state.clients[0];
    if (client === undefined) return;
    done.current = true;
    for (const block of state.blocks) {
      if (block.clientId === client.id && block.status === 'proposed') {
        dispatch({ type: 'confirmBlock', blockId: block.id });
      }
    }
  }, [state.status, state.blocks, state.clients, dispatch]);
  return null;
}

/** Renders the Objections panel for the first client. */
function FirstClientObjections(): JSX.Element {
  const state = useApp();
  const client = state.clients[0];
  if (client === undefined) return <></>;
  return <Objections draft={draftFor(state, client.id)} />;
}

function renderObjections(confirm: boolean): void {
  render(
    <AppProvider>
      <I18nProvider>
        <LoadSampleMonth />
        {confirm && <ConfirmFirstClient />}
        <FirstClientObjections />
      </I18nProvider>
    </AppProvider>,
  );
}

const REGION = 'What a client could argue';

describe('Objections', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  it('lists at least one objection with a visible severity and a score in 0..100', async () => {
    renderObjections(true);
    const region = await screen.findByRole('region', { name: REGION });
    const items = within(region).getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
    // The severity is written out, not carried by colour alone.
    expect(items.some((item) => /High|Medium|Low/.test(item.textContent ?? ''))).toBe(true);

    const scoreText = within(region).getByText(/\/ 100$/).textContent ?? '';
    const score = Number.parseInt(scoreText, 10);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('shows the empty state once nothing is left to object to', async () => {
    render(
      <AppProvider>
        <I18nProvider>
          <LoadSampleMonth />
          <EmptyObjections />
        </I18nProvider>
      </AppProvider>,
    );
    await screen.findByText('Nothing obvious: every billed hour is well proven.');
    const region = screen.getByRole('region', { name: REGION });
    expect(within(region).queryByRole('list')).toBeNull();
    expect(within(region).getByText(/0 \/ 100$/)).toBeDefined();
  });
});

/**
 * Builds a state with no objection, through the real actions: resolve every
 * open conflict, drop the confirmed leftovers, set a tax rate and turn on the
 * with-evidence annex. Nothing is mocked.
 */
function EmptyObjections(): JSX.Element {
  const state = useApp();
  const dispatch = useDispatch();
  const client = state.clients[0];

  useEffect(() => {
    if (state.status !== 'ready') return;

    const conflict = state.conflicts.find((item) => !item.resolved);
    if (conflict !== undefined) {
      dispatch({ type: 'resolveConflict', conflictId: conflict.id, keepBlockId: conflict.blockIds[0] ?? '' });
      return;
    }

    const billable = state.blocks.find(
      (block) => block.clientId === client?.id && (block.status === 'confirmed' || block.status === 'locked'),
    );
    if (billable !== undefined) {
      dispatch({ type: 'rejectBlock', blockId: billable.id });
      return;
    }

    if (state.taxRateBp <= 0) {
      dispatch({ type: 'setTaxRate', basisPoints: 2000 });
      return;
    }

    if (state.annexDetail !== 'with-evidence') {
      dispatch({ type: 'setAnnexDetail', detail: 'with-evidence' });
    }
  }, [state, client, dispatch]);

  if (client === undefined) return <></>;
  return <Objections draft={draftFor(state, client.id)} />;
}