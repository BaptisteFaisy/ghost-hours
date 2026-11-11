// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProvider } from '../state/store.tsx';
import { I18nProvider } from '../i18n/index.ts';
import { Week } from './Week.tsx';
import { clearBrowserStorage, stubBrowserStorage } from '../components/testSupport.ts';
import { JumpToFirstConflict, LoadSampleMonth } from '../components/sampleMonth.tsx';

/**
 * The week screen (D.7 P5, HEU-N-04) on the fictitious month: the grid, the
 * gestures, the conflicts and the equivalent table view.
 */

const GRID = 'Week grid of reconstructed blocks';
const TABLE = 'Equivalent table of the week';

function renderWeek(): void {
  render(
    <AppProvider>
      <I18nProvider>
        <LoadSampleMonth />
        <JumpToFirstConflict />
        <Week />
      </I18nProvider>
    </AppProvider>,
  );
}

async function grid(): Promise<HTMLElement> {
  const region = await screen.findByRole('grid', { name: GRID });
  await waitFor(() => {
    expect(within(region).getAllByRole('columnheader').length).toBe(7);
  });
  return region;
}

function dayKeysOf(region: HTMLElement): readonly string[] {
  return within(region)
    .getAllByRole('columnheader')
    .map((cell) => cell.getAttribute('data-day'))
    .filter((key): key is string => key !== null);
}

describe('Week', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  it('shows the seven days of the week in the grid and in the table', async () => {
    renderWeek();
    const region = await grid();
    const table = await screen.findByRole('table', { name: TABLE });
    const gridDays = dayKeysOf(region);
    const tableDays = [...table.querySelectorAll('th[data-day]')]
      .map((cell) => cell.getAttribute('data-day'))
      .filter((key): key is string => key !== null);
    expect(gridDays.length).toBe(7);
    expect(new Set(tableDays)).toEqual(new Set(gridDays));
  });

  it('confirms a block with one gesture', async () => {
    const user = userEvent.setup();
    renderWeek();
    await grid();
    const confirms = await screen.findAllByRole('button', { name: /^Confirm — / });
    const confirm = confirms[0];
    if (confirm === undefined) throw new Error('no confirm button');
    expect(document.querySelectorAll('.block[data-status="confirmed"]').length).toBe(0);
    await user.click(confirm);
    await waitFor(() => {
      expect(document.querySelectorAll('.block[data-status="confirmed"]').length).toBeGreaterThan(0);
    });
  });

  it('shows the conflict of the week and settles it', async () => {
    const user = userEvent.setup();
    renderWeek();
    await grid();
    const conflicts = await screen.findByRole('region', { name: 'Resolve conflict' });
    const keep = within(conflicts).getAllByRole('button')[0];
    if (keep === undefined) throw new Error('no arbitration button');
    await user.click(keep);
    await waitFor(() => {
      expect(document.querySelectorAll('[data-status="rejected"]').length).toBeGreaterThan(0);
    });
  });
});
