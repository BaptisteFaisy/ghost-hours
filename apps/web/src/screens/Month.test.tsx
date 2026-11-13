// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProvider } from '../state/store.tsx';
import { I18nProvider } from '../i18n/index.ts';
import { Month } from './Month.tsx';
import { clearBrowserStorage, stubBrowserStorage } from '../components/testSupport.ts';
import { LoadSampleMonth } from '../components/sampleMonth.tsx';

/**
 * The month screen (D.7 P4, HEU-N-04) on the fictitious month: 104 h found,
 * 92 h declared, 12 h of ghost hours worth 780 €.
 */

const COUNTER = 'Ghost hours counter for the selected month';

function renderMonth(): void {
  render(
    <AppProvider>
      <I18nProvider>
        <LoadSampleMonth />
        <Month />
      </I18nProvider>
    </AppProvider>,
  );
}

async function counter(): Promise<HTMLElement> {
  const region = screen.getByLabelText(COUNTER);
  await waitFor(() => {
    expect(within(region).getByText('104 h')).toBeDefined();
  });
  return region;
}

describe('Month', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  it('announces 104 h found, 12 h of ghost hours and 780 €', async () => {
    renderMonth();
    const region = await counter();
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(within(region).getByText('104 h')).toBeDefined();
    expect(within(region).getByText('92 h')).toBeDefined();
    expect(within(region).getByText('12 h')).toBeDefined();
    expect(within(region).getByText('€780.00')).toBeDefined();
  });

  it('breaks the month down per client, with a declared-hours input each', async () => {
    renderMonth();
    await counter();
    expect(screen.getAllByText('Acme').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Northwind').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Globex').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Declared hours — Acme')).toBeDefined();
    expect(screen.getByLabelText('Declared hours — Northwind')).toBeDefined();
    expect(screen.getByLabelText('Declared hours — Globex')).toBeDefined();
  });

  it('recomputes the ghost hours as soon as the declared hours change', async () => {
    const user = userEvent.setup();
    renderMonth();
    const region = await counter();
    const input = screen.getByLabelText('Declared hours — Acme');
    await user.clear(input);
    await user.type(input, '40');
    // Acme drops from 50 h to 40 h declared: 10 h more ghost hours overall.
    await waitFor(() => {
      expect(within(region).getByText('22 h')).toBeDefined();
    });
  });

  it('gives the load of every day in words as well as in bars', async () => {
    renderMonth();
    await counter();
    expect(screen.getByRole('group', { name: 'Load per day' })).toBeDefined();
    expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0);
  });
});

describe('Month — ghost explainer and solid confirmation', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  it('explains the 12 ghost hours with at least one cause', async () => {
    renderMonth();
    await counter();
    await screen.findByText('Where the 12 h ghost hours come from');
    expect(screen.getByText('Meetings taken from the calendar')).toBeDefined();
  });

  it('confirms the solid blocks in one gesture', async () => {
    const user = userEvent.setup();
    renderMonth();
    const region = await counter();
    expect(within(region).getByText('0 h')).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Confirm everything solid' }));
    await waitFor(() => {
      expect(screen.getByText(/\d+ blocks confirmed\./)).toBeDefined();
    });
    await waitFor(() => {
      expect(within(region).queryByText('0 h')).toBeNull();
    });
  });
});

describe('Month — which month is under review, and for whom', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  /** The month picker, as an input so its value can be read and changed. */
  function picker(): HTMLInputElement {
    // The navigation and the input carry the same label: ask for the input.
    return screen.getByLabelText('Month to review', { selector: 'input' }) as HTMLInputElement;
  }

  it('steps one month with the previous and next gestures', async () => {
    renderMonth();
    await counter();
    expect(picker().value).toBe('2026-11');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(picker().value).toBe('2026-12');
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(picker().value).toBe('2026-11');
  });

  it('says so when the chosen month holds no block', async () => {
    renderMonth();
    await counter();
    fireEvent.change(picker(), { target: { value: '2026-12' } });
    await waitFor(() => expect(screen.getByText('No block on this day.')).toBeDefined());
  });

  it('narrows the breakdowns to one client and leaves the counter global', async () => {
    renderMonth();
    const region = await counter();
    expect(screen.getByRole('rowheader', { name: 'Globex' })).toBeDefined();

    await userEvent.selectOptions(screen.getByLabelText('Client'), 'Acme');

    await waitFor(() => expect(screen.queryByRole('rowheader', { name: 'Globex' })).toBeNull());
    expect(screen.getByRole('rowheader', { name: 'Acme' })).toBeDefined();
    expect(screen.queryByLabelText('Declared hours — Globex')).toBeNull();
    // The headline never narrows: 104 h found is the month, not the filter.
    expect(within(region).getByText('104 h')).toBeDefined();
  });
});

describe('Month — a month that is only partly declared', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  it('says how far the declaration got instead of claiming nothing was typed', async () => {
    const user = userEvent.setup();
    renderMonth();
    const region = await counter();
    // The sample month arrives fully declared: empty two clients of three.
    await user.clear(screen.getByLabelText('Declared hours — Northwind'));
    await user.clear(screen.getByLabelText('Declared hours — Globex'));

    await waitFor(() =>
      expect(within(region).getByText(/1 of 3 clients declared/)).toBeDefined(),
    );
    expect(within(region).queryByText('No declared hours yet')).toBeNull();
    // What is declared so far is shown, and the total is still refused: a
    // partial sum would inflate the ghost hours.
    expect(within(region).getByText(/50 h — 1 of 3/)).toBeDefined();
    expect(within(region).getByText('Ghost hours').nextElementSibling?.textContent).toBe('—');
  });
});
