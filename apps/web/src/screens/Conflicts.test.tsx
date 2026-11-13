// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProvider } from '../state/store.tsx';
import { I18nProvider } from '../i18n/index.ts';
import { Conflicts } from './Conflicts.tsx';
import { clearBrowserStorage, stubBrowserStorage } from '../components/testSupport.ts';
import { LoadSampleMonth } from '../components/sampleMonth.tsx';

/**
 * The contradictions screen (idea P-06 / A-09) on the fictitious month: the
 * list of every unresolved conflict, the three gestures (keep one side, keep
 * the other, share the minutes) and the empty state once all is settled.
 */

const TITLE = 'Contradictions to settle';
const EMPTY = 'No contradiction: no two clients claim the same minutes.';

function renderConflicts(): void {
  render(
    <AppProvider>
      <I18nProvider>
        <LoadSampleMonth />
        <Conflicts />
      </I18nProvider>
    </AppProvider>,
  );
}

async function keepButtons(): Promise<HTMLElement[]> {
  return screen.findAllByRole('button', { name: /^Keep / });
}

/** The conflict `<section>` (class `conflict`) that holds an element. */
function conflictSectionOf(element: HTMLElement): HTMLElement {
  const section = element.closest<HTMLElement>('section.conflict');
  if (section === null) throw new Error('element is not inside a conflict section');
  return section;
}

async function settleEveryConflict(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  for (let guard = 0; guard < 10; guard += 1) {
    const buttons = screen.queryAllByRole('button', { name: /^Keep / });
    const first = buttons[0];
    if (first === undefined) return;
    await user.click(first);
    await waitFor(() => {
      expect(screen.queryAllByRole('button', { name: /^Keep / }).length).toBeLessThan(buttons.length);
    });
  }
  throw new Error('conflicts were not all settled');
}

describe('Conflicts screen', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  it('lists the contradictions of the month with both sides and their evidence', async () => {
    renderConflicts();
    await screen.findByRole('heading', { name: TITLE });
    const keeps = await keepButtons();
    expect(keeps.length).toBeGreaterThanOrEqual(2);
    const first = keeps[0];
    if (first === undefined) throw new Error('no keep button');
    const section = conflictSectionOf(first);
    // Both sides of the contradiction are shown, with times and a proven part.
    expect(section.querySelectorAll('.block').length).toBe(2);
    expect(within(section).getAllByText(/Proven:/).length).toBe(2);
    // The position counter is announced politely.
    const counter = within(section).getByText(/^\d+ of \d+$/);
    expect(counter.getAttribute('aria-live')).toBe('polite');
    // The evidence in cause is listed.
    const evidence = within(section).getByRole('region', { name: 'Evidence in conflict' });
    expect(evidence.querySelectorAll('.evidence-item').length).toBeGreaterThan(0);
  });
});

describe('Conflicts screen — the three gestures', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  it('shares the minutes: the conflict is settled and both blocks come back proposed', async () => {
    const user = userEvent.setup();
    renderConflicts();
    const keeps = await keepButtons();
    const first = keeps[0];
    if (first === undefined) throw new Error('no keep button');
    const section = conflictSectionOf(first);
    await user.click(within(section).getByRole('button', { name: 'Share the minutes' }));
    await waitFor(() => {
      expect(section.textContent ?? '').toContain('Settled');
      expect(section.querySelectorAll('.block[data-status="proposed"]').length).toBe(2);
    });
    expect(within(section).queryByRole('button', { name: 'Share the minutes' })).toBeNull();
  });

  it('keeps Acme: the kept block is confirmed, the other rejected', async () => {
    const user = userEvent.setup();
    renderConflicts();
    const keeps = await keepButtons();
    const keepAcme = keeps.find((button) => /^Keep Acme/.test(button.getAttribute('aria-label') ?? ''));
    if (keepAcme === undefined) throw new Error('no conflict offers to keep Acme');
    const section = conflictSectionOf(keepAcme);
    await user.click(keepAcme);
    await waitFor(() => {
      expect(section.textContent ?? '').toContain('Settled');
      expect(section.querySelectorAll('.block[data-status="confirmed"]').length).toBe(1);
      expect(section.querySelectorAll('.block[data-status="rejected"]').length).toBe(1);
    });
  });

  it('shows the empty state once every contradiction is settled', async () => {
    const user = userEvent.setup();
    renderConflicts();
    await keepButtons();
    await settleEveryConflict(user);
    expect(await screen.findByText(EMPTY)).toBeDefined();
    // Settled contradictions remain listed at the end, marked as such.
    expect(screen.getAllByText('Settled').length).toBeGreaterThan(0);
  });
});

describe('Conflicts — the over-booked days panel', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  it('is on screen, named, and states the threshold it applies', async () => {
    renderConflicts();
    const panel = await screen.findByRole('region', { name: 'Over-booked days' });
    await waitFor(() =>
      expect(within(panel).getByText(/No day exceeds one working day/)).toBeTruthy(),
    );
    // The threshold is printed, so the reader can check the claim: 420 min = 7h.
    expect(within(panel).getByText(/one working day \(7h\)/)).toBeTruthy();
  });
});

