// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
