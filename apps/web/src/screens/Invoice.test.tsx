// @vitest-environment jsdom
import { useEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProvider, useApp, useDispatch } from '../state/store.tsx';
import { I18nProvider } from '../i18n/index.ts';
import { Invoice } from './Invoice.tsx';
import { LoadSampleMonth } from '../components/sampleMonth.tsx';
import { clearBrowserStorage, stubBrowserStorage } from '../components/testSupport.ts';
import * as download from '../lib/download.ts';

/**
 * The draft screen (HEU-F-23, HEU-F-25, HEU-F-26, HEU-F-27): it says Draft,
 * it carries no number, its total is the sum of its lines, and its three
 * exports are built in the tab.
 */
vi.mock('../lib/download.ts', () => ({
  downloadText: vi.fn(() => true),
  openPrintWindow: vi.fn(() => true),
}));

const CURRENCY = /€\s?[\d\s.,]+/;

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

function renderInvoice(): void {
  render(
    <AppProvider>
      <I18nProvider>
        <LoadSampleMonth />
        <ConfirmFirstClient />
        <Invoice />
      </I18nProvider>
    </AppProvider>,
  );
}

function moneyOf(text: string): number {
  const digits = text.replace(/[^\d,]/g, '');
  return Number.parseFloat(digits.replace(',', '.'));
}

describe('Invoice', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
    vi.mocked(download.downloadText).mockClear();
    vi.mocked(download.openPrintWindow).mockClear();
  });

  it('says Draft and carries no invoice number', async () => {
    renderInvoice();
    await waitFor(() => expect(screen.getByText('Draft')).toBeDefined());
    const section = screen.getByRole('region', { name: 'Invoice draft' });
    const text = section.textContent ?? '';
    // No invoice reference of any shape: no "n° 12", no "FA-2026-01", no "#7".
    expect(text).not.toMatch(/n[°o]\s*\d/i);
    expect(text).not.toMatch(/\b[A-Z]{2,4}-\d{2,}/);
    expect(text).not.toMatch(/#[0-9]{2,}/);
    // The draft says so on its face.
    expect(text).toContain('no invoice number');
  });

  it('builds a total that is the sum of its lines', async () => {
    renderInvoice();
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(2));
    const table = screen.getAllByRole('table')[0];
    if (!table) throw new Error('no line table');
    const rows = within(table).getAllByRole('row').slice(1);
    const lines = rows.map((row) => moneyOf(within(row).getAllByRole('cell')[2]?.textContent ?? '0'));
    const subtotal = moneyOf(screen.getByText(/Subtotal/).textContent ?? '0');
    expect(lines.length).toBeGreaterThan(0);
    expect(subtotal).toBeCloseTo(lines.reduce((sum, value) => sum + value, 0), 2);
  });

  it('exports the timesheet as CSV, the draft as JSON and prints', async () => {
    renderInvoice();
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(2));
    await userEvent.click(screen.getByRole('button', { name: 'Export the timesheet (CSV)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Export the data (JSON)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Print the draft' }));

    const csv = vi.mocked(download.downloadText).mock.calls[0];
    const json = vi.mocked(download.downloadText).mock.calls[1];
    expect(csv?.[0]).toMatch(/\.csv$/);
    expect((csv?.[1] ?? '').length).toBeGreaterThan(0);
    expect(json?.[0]).toMatch(/\.json$/);
    expect(JSON.parse(json?.[1] ?? '{}').draftLabel).toBe('Draft');
    expect(vi.mocked(download.openPrintWindow)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(download.openPrintWindow).mock.calls[0]?.[0] ?? '').toContain('Draft');
  });

});

describe('Invoice — objections and defensibility', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  it('lists at least one objection and a defensibility score out of 100', async () => {
    renderInvoice();
    const region = await screen.findByRole('region', { name: 'What a client could argue' });
    expect(within(region).getAllByRole('listitem').length).toBeGreaterThan(0);
    const scoreText = within(region).getByText(/\/ 100$/).textContent ?? '';
    const score = Number.parseInt(scoreText, 10);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('Invoice — tax, annex and client', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
    vi.mocked(download.downloadText).mockClear();
    vi.mocked(download.openPrintWindow).mockClear();
  });

  it('changes the total when a tax rate is typed', async () => {
    renderInvoice();
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(2));
    const before = moneyOf(screen.getByText(/Grand total|Total/).textContent ?? '0');
    await userEvent.clear(screen.getByLabelText('Tax rate'));
    await userEvent.type(screen.getByLabelText('Tax rate'), '20');
    await waitFor(() => {
      const after = moneyOf(screen.getByText(/Grand total|Total/).textContent ?? '0');
      expect(after).toBeGreaterThan(before);
    });
  });

  it('switches the annex detail level', async () => {
    renderInvoice();
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(2));
    await userEvent.selectOptions(screen.getByLabelText('Annex detail'), 'with-evidence');
    expect((screen.getByLabelText('Annex detail') as HTMLSelectElement).value).toBe('with-evidence');
  });

  it('picks another client and shows its own draft', async () => {
    renderInvoice();
    await waitFor(() => expect(screen.getByLabelText('Client')).toBeDefined());
    const select = screen.getByLabelText('Client') as HTMLSelectElement;
    expect(select.options.length).toBeGreaterThan(1);
    await userEvent.selectOptions(select, select.options[1]?.value ?? '');
    expect(select.value).toBe(select.options[1]?.value);
    expect(screen.getAllByText(CURRENCY).length).toBeGreaterThan(0);
  });
});
