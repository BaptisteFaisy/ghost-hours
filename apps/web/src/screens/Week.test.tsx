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

  it('shows the seven days of the week in the grid and in the table view', async () => {
    const user = userEvent.setup();
    renderWeek();
    const region = await grid();
    const gridDays = dayKeysOf(region);
    expect(gridDays.length).toBe(7);
    // The two views are exclusive: switch to the table to compare the days.
    await user.click(screen.getByRole('button', { name: 'Table view' }));
    const table = await screen.findByRole('table', { name: TABLE });
    const tableDays = [...table.querySelectorAll('th[data-day]')]
      .map((cell) => cell.getAttribute('data-day'))
      .filter((key): key is string => key !== null);
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

describe('Week — declaring a block by hand (HEU-F-05)', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  it('adds a declared block and says how long it is', async () => {
    renderWeek();
    await grid();
    await userEvent.click(screen.getByRole('button', { name: 'Add a block' }));
    const form = screen.getByRole('region', { name: 'Add a block by hand' });
    await userEvent.click(within(form).getByRole('button', { name: 'Add the block' }));
    await waitFor(() => {
      expect(within(form).getByText(/Block added: 1h/)).toBeDefined();
    });
  });

  it('refuses an end that comes before the start', async () => {
    renderWeek();
    await grid();
    await userEvent.click(screen.getByRole('button', { name: 'Add a block' }));
    const form = screen.getByRole('region', { name: 'Add a block by hand' });
    await userEvent.clear(within(form).getByLabelText('End'));
    await userEvent.type(within(form).getByLabelText('End'), '08:00');
    const add = within(form).getByRole('button', { name: 'Add the block' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(within(form).getByRole('alert').textContent ?? '').toContain('after the start');
  });

  it('closes without adding anything when cancelled', async () => {
    renderWeek();
    await grid();
    await userEvent.click(screen.getByRole('button', { name: 'Add a block' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'Add a block by hand' })).toBeNull();
  });
});

describe('Week — the explicit choice between grid and table', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  it('shows the grid on arrival — the e2e smoke contract (smoke.spec.ts requirement 3)', async () => {
    renderWeek();
    // smoke.spec.ts: `page.getByRole('grid', { name: /Week grid/i })` visible
    // right after reaching the Week view, then the first "Confirm the day".
    const region = await screen.findByRole('grid', { name: /Week grid/i });
    expect(region).toBeDefined();
    const confirmDay = (
      await screen.findAllByRole('button', { name: /Confirm the day/i })
    )[0];
    expect(confirmDay).toBeDefined();
    // The table is not rendered until it is chosen.
    expect(screen.queryByRole('table', { name: TABLE })).toBeNull();
  });

  it('switches to the table in one click and removes the grid', async () => {
    const user = userEvent.setup();
    renderWeek();
    await grid();
    await user.click(screen.getByRole('button', { name: 'Table view' }));
    await screen.findByRole('table', { name: TABLE });
    expect(screen.queryByRole('grid', { name: /Week grid/i })).toBeNull();
  });

  it('reflects the chosen view in aria-pressed and switches back', async () => {
    const user = userEvent.setup();
    renderWeek();
    await grid();
    const gridButton = screen.getByRole('button', { name: 'Grid view' });
    const tableButton = screen.getByRole('button', { name: 'Table view' });
    expect(gridButton.getAttribute('aria-pressed')).toBe('true');
    expect(tableButton.getAttribute('aria-pressed')).toBe('false');
    await user.click(tableButton);
    expect(tableButton.getAttribute('aria-pressed')).toBe('true');
    expect(gridButton.getAttribute('aria-pressed')).toBe('false');
    await user.click(gridButton);
    await grid();
    expect(gridButton.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('table', { name: TABLE })).toBeNull();
  });

  it('keeps "Confirm the day" reachable in both views (smoke.spec.ts requirement 3)', async () => {
    const user = userEvent.setup();
    renderWeek();
    await grid();
    expect((await screen.findAllByRole('button', { name: /Confirm the day/i })).length).toBe(7);
    await user.click(screen.getByRole('button', { name: 'Table view' }));
    await screen.findByRole('table', { name: TABLE });
    expect((await screen.findAllByRole('button', { name: /Confirm the day/i })).length).toBe(7);
  });
});
