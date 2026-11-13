// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { AppProvider } from '../state/store.tsx';
import { I18nProvider } from '../i18n/index.ts';
import { GapExplainer } from './GapExplainer.tsx';
import { LoadSampleMonth } from './sampleMonth.tsx';
import { clearBrowserStorage, stubBrowserStorage } from './testSupport.ts';

/**
 * The ghost-hours explanation (idea I-01) on the fictitious month: 12 ghost
 * hours, explained by at least one cause, never by colour alone.
 */

const TITLE = 'Where the 12 h ghost hours come from';

function renderPanel(withSample: boolean): void {
  render(
    <AppProvider>
      <I18nProvider>
        {withSample && <LoadSampleMonth />}
        <GapExplainer />
      </I18nProvider>
    </AppProvider>,
  );
}

/** `'1h30'` or `'45m'` back to minutes, as `formatMinutes` renders them. */
function parseDuration(text: string | null | undefined): number {
  if (text === null || text === undefined) return 0;
  const hours = /(\d+)h/.exec(text);
  const minutes = /(\d+)m/.exec(text);
  let total = 0;
  if (hours !== null) {
    total += Number(hours[1]) * 60;
    const remainder = /h(\d+)/.exec(text);
    if (remainder !== null) total += Number(remainder[1]);
  }
  if (minutes !== null) total += Number(minutes[1]);
  return total;
}

describe('GapExplainer', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  it('explains the 12 ghost hours with at least one cause, never exceeding them', async () => {
    renderPanel(true);
    await screen.findByText(TITLE);
    const section = screen.getByText(TITLE).closest('section');
    expect(section).not.toBeNull();
    expect(section?.getAttribute('aria-live')).toBe('polite');

    const items = within(section as HTMLElement).getAllByRole('listitem');
    const causes = items.filter((item) => !(item.textContent ?? '').includes('Not explained'));
    expect(causes.length).toBeGreaterThan(0);

    const total = causes.reduce(
      (sum, item) => sum + parseDuration(item.querySelector('.numeric')?.textContent),
      0,
    );
    expect(total).toBeLessThanOrEqual(720);
  });

  it('tells the empty story when no hour was declared', async () => {
    renderPanel(false);
    await screen.findByText('Declare the hours you remember, and the gap explains itself.');
    // Without declared hours there is no cause list at all.
    expect(screen.queryByRole('list')).toBeNull();
  });
});