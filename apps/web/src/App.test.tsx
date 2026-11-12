// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import { AppProvider } from './state/store.tsx';

/**
 * The shell says out loud when the browser refuses to keep the data (idea
 * R-09, storage fallback). A review that will not survive a reload has to
 * announce itself where the reader is looking, not only in the import report
 * of the settings screen — so the persistence layer is made to fail here.
 */
vi.mock('./state/persistence.ts', () => ({
  loadState: vi.fn(async () => ({ ok: true, value: null })),
  saveState: vi.fn(async () => ({ ok: false, errors: ['indexeddb write failed'] })),
  clearState: vi.fn(async () => ({ ok: true, value: null })),
}));

describe('App — the storage warning is visible', () => {
  it('alerts when a write is refused, and says what it means', async () => {
    render(
      <AppProvider>
        <App />
      </AppProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: /Load the sample month/i }));
    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert.textContent).toContain('could not be saved'));
    // The raw reason is kept: a warning that hides its cause cannot be acted on.
    expect(alert.textContent).toContain('indexeddb write failed');
  });
});
