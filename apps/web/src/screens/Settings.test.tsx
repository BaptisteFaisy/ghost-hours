// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProvider } from '../state/store.tsx';
import { I18nProvider } from '../i18n/index.ts';
import { Settings } from './Settings.tsx';
import { LoadSampleMonth } from '../components/sampleMonth.tsx';
import { clearBrowserStorage, stubBrowserStorage } from '../components/testSupport.ts';
import { serializeEvidenceFile } from '@ghost-hours/core';

/**
 * The settings screen: the imports that make the app usable with real data
 * (HEU-F-01/02/04), the dataset round-trip, and the lead-in calibration that
 * is offered but never applied on its own (HEU-F-17).
 */

const EVIDENCE = serializeEvidenceFile(
  [
    {
      id: 'git:acme-api:aaaa1111',
      source: 'git',
      kind: 'commit',
      clientId: null,
      at: Date.UTC(2026, 10, 4, 9, 0),
      repo: 'acme-api',
      summary: 'Add the export',
    },
    {
      id: 'git:acme-api:aaaa2222',
      source: 'git',
      kind: 'commit',
      clientId: null,
      at: Date.UTC(2026, 10, 4, 11, 0),
      repo: 'acme-api',
      summary: 'Test the export',
    },
  ],
  { collectedAt: Date.UTC(2026, 10, 30, 18, 0), timeZone: 'Europe/Paris' },
);

function renderSettings(): void {
  render(
    <AppProvider>
      <I18nProvider>
        <LoadSampleMonth />
        <Settings />
      </I18nProvider>
    </AppProvider>,
  );
}

function jsonFile(name: string, value: unknown): File {
  return new File([JSON.stringify(value)], name, { type: 'application/json' });
}

describe('Settings', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  it('imports an evidence file and reports how many proofs it read', async () => {
    renderSettings();
    const input = await screen.findByLabelText(/Import evidence/i);
    await userEvent.upload(input, jsonFile('evidence.json', EVIDENCE));
    await waitFor(() => {
      expect(screen.getByText(/Imported 2 pieces of evidence/)).toBeDefined();
    });
  });

  it('imports a calendar and turns a recurring meeting into occurrences', async () => {
    renderSettings();
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'X-WR-TIMEZONE:Europe/Paris',
      'BEGIN:VEVENT',
      'UID:weekly@example.com',
      'DTSTART;TZID=Europe/Paris:20261102T090000',
      'DTEND;TZID=Europe/Paris:20261102T093000',
      'SUMMARY:Weekly sync',
      'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4',
      'ATTENDEE;PARTSTAT=ACCEPTED:mailto:sofia@example.com',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    const input = await screen.findByLabelText(/calendar/i);
    await userEvent.upload(input, new File([ics], 'agenda.ics', { type: 'text/calendar' }));
    await waitFor(() => {
      expect(screen.getAllByText(/calendar: 1 events → 4 occurrences/).length).toBeGreaterThan(0);
    });
  });

});

describe('Settings — refus, calibration et langue', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  it('refuses a file that is neither evidence nor a dataset, and says why', async () => {
    renderSettings();
    const input = await screen.findByLabelText(/Import evidence/i);
    await userEvent.upload(input, jsonFile('broken.json', { nope: true }));
    await waitFor(() => {
      expect(screen.getByText(/Could not read broken\.json/)).toBeDefined();
    });
  });

  it('offers the calibration but never applies it alone', async () => {
    renderSettings();
    const panel = await screen.findByRole('region', { name: /Lead-in calibration/i });
    expect(within(panel).getByText(/Ten corrections are needed/)).toBeDefined();
    expect(within(panel).getByText(/Nothing is applied without you clicking/)).toBeDefined();
    expect(within(panel).queryByRole('button', { name: /Use it as the default/i })).toBeNull();
  });

  it('switches the language without a reload', async () => {
    renderSettings();
    await userEvent.selectOptions(await screen.findByLabelText(/^Language$/), 'fr');
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Réglages' })).toBeDefined();
    });
  });
});

describe('Settings — automation filter and decision log (idées A-01, C-06)', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  const BOT_EVIDENCE = {
    version: 1,
    collected_at: '2026-11-30T18:00:00.000Z',
    items: [
      {
        id: 'git:acme-api:bot0000001',
        source: 'git',
        kind: 'commit',
        at: '2026-11-04T09:00:00.000Z',
        repo: 'acme-api',
        summary: 'build(deps): bump zod from 3.24.1 to 3.24.2',
        authorEmail: 'dependabot[bot]@users.noreply.github.com',
      },
      {
        id: 'git:acme-api:human0001',
        source: 'git',
        kind: 'commit',
        at: '2026-11-04T10:00:00.000Z',
        repo: 'acme-api',
        summary: 'Add the export',
        authorEmail: 'sofia@example.com',
      },
    ],
  };

  it('lists the automation it set aside, and gives it back when asked', async () => {
    renderSettings();
    const input = await screen.findByLabelText(/Import evidence/i);
    await userEvent.upload(input, jsonFile('evidence.json', BOT_EVIDENCE));

    const panel = await screen.findByRole('region', { name: /Set aside as automation/i });
    await waitFor(() => expect(within(panel).getByText(/1 commits set aside/)).toBeDefined());
    expect(within(panel).getByText(/dependabot/)).toBeDefined();

    await userEvent.click(within(panel).getByLabelText(/Set aside commits from bots/i));
    await waitFor(() => expect(within(panel).getByText(/Nothing was set aside/)).toBeDefined());
  });

});

describe('Settings — decision log and pause threshold', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  it('keeps a chained decision log and says the chain is intact', async () => {
    renderSettings();
    const panel = await screen.findByRole('region', { name: /Decision log/i });
    await waitFor(() => {
      expect(within(panel).getByText(/The chain is intact/)).toBeDefined();
    });
    expect(within(panel).getAllByText(/loadSampleMonth/).length).toBeGreaterThan(0);
  });

  it('exposes the pause threshold that splits a working day', async () => {
    renderSettings();
    const field = (await screen.findByLabelText(/Pause that splits a day/i)) as HTMLInputElement;
    expect(field.value).toBe('60');
    fireEvent.change(field, { target: { value: '45' } });
    await waitFor(() => {
      expect((screen.getByLabelText(/Pause that splits a day/i) as HTMLInputElement).value).toBe('45');
    });
  });
});
