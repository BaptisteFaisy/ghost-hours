// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App.tsx';
import { AppProvider } from './state/store.tsx';
import { loadState, saveState } from './state/persistence.ts';

/**
 * Two things the shell owes the reader: a way in with their own files, and the
 * truth about the browser's storage. A review that will not survive a reload
 * has to say so where the reader is looking, not only in the import report of
 * the settings screen — so the persistence layer is driven from here.
 */
vi.mock('./state/persistence.ts', () => ({
  loadState: vi.fn(async () => ({ ok: true, value: null })),
  saveState: vi.fn(async () => ({ ok: true, value: null })),
  clearState: vi.fn(async () => ({ ok: true, value: null })),
}));

const WRITE_REFUSED = { ok: false, errors: ['indexeddb write failed'] } as never;
const READ_REFUSED = { ok: false, kind: 'read', errors: ['indexeddb open failed'] } as never;
const EVERYTHING_FINE = { ok: true, value: null } as never;

function renderApp(): void {
  render(
    <AppProvider>
      <App />
    </AppProvider>,
  );
}

describe('App — the empty state opens the reader’s own files', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(saveState).mockResolvedValue(EVERYTHING_FINE);
  });

  it('reveals the import panel in place', async () => {
    renderApp();
    const door = screen.getByRole('button', { name: 'Import your own files' });
    expect(door.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(door);
    expect(door.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('region', { name: 'Import your own evidence' })).toBeDefined();
  });
});

describe('App — the storage warning is visible', () => {
  afterEach(cleanup);

  it('alerts when a write is refused, and says what it means', async () => {
    vi.mocked(saveState).mockResolvedValue(WRITE_REFUSED);
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: /Load the sample month/i }));
    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert.textContent).toContain('could not be saved'));
    // The raw reason is kept: a warning that hides its cause cannot be acted on.
    expect(alert.textContent).toContain('indexeddb write failed');
  });

  it('says the previous session is gone when the stored data cannot be read', async () => {
    // A refused write must not cover a failed read: they do not mean the same
    // thing, so the write is made to succeed here.
    vi.mocked(saveState).mockResolvedValue(EVERYTHING_FINE);
    vi.mocked(loadState).mockResolvedValueOnce(READ_REFUSED);
    renderApp();
    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert.textContent).toContain('could not be read'));
    expect(alert.textContent).toContain('indexeddb open failed');
  });
});
