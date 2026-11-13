// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.tsx';
import { AppProvider } from '../state/store.tsx';

/**
 * The one-click real demo: from the empty state, the button fetches the
 * anonymized month (lazily — the JSON never ships in the initial bundle) and
 * the shell then says out loud that the data on screen is real.
 */
vi.mock('../state/persistence.ts', () => ({
  loadState: vi.fn(async () => ({ ok: true, value: null })),
  saveState: vi.fn(async () => ({ ok: true, value: null })),
  clearState: vi.fn(async () => ({ ok: true, value: null })),
}));

function renderApp(): void {
  render(
    <AppProvider>
      <App />
    </AppProvider>,
  );
}

describe('LoadRealMonthButton — the real month in one click', () => {
  afterEach(cleanup);

  it('loads the real month from the empty state and shows the provenance note', async () => {
    renderApp();
    const button = screen.getByRole('button', { name: /Load a real month/i });
    await userEvent.click(button);
    // The fixture is fetched lazily and 977 proofs are reconstructed: give it room.
    const note = await screen.findByRole('note', undefined, { timeout: 20_000 });
    expect(note.textContent).toContain('October 2026');
    expect(note.textContent).toContain('977');
    // The review itself is on screen: the empty state gave way to the month.
    expect(screen.queryByRole('button', { name: /Load a real month/i })).toBeNull();
  }, 30_000);
});
