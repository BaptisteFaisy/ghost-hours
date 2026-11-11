// @vitest-environment jsdom
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS, zonedTimeToInstant } from '@ghost-hours/core';
import type { Client, Evidence as Proof } from '@ghost-hours/core';
import { AppProvider, useDispatch } from '../state/store.tsx';
import { I18nProvider } from '../i18n/index.ts';
import { Evidence } from './Evidence.tsx';
import { clearBrowserStorage, stubBrowserStorage } from '../components/testSupport.ts';

/**
 * The evidence screen (D.11, HEU-F-20, D.7 P6): opening a block lists every
 * proof it rests on — a commit and a meeting here — with their instants and
 * the fields their source carries, plus the proven and assumed shares.
 */

const TZ = DEFAULT_SETTINGS.timeZone;

function at(day: number, hour: number, minute: number): number {
  return zonedTimeToInstant({ year: 2026, month: 11, day, hour, minute }, TZ);
}

const ACME: Client = {
  id: 'cli-acme',
  name: 'Acme',
  mode: 'hourly',
  rateCents: 6500,
  dayRateCents: 0,
  currency: 'EUR',
  rounding: { mode: 'nearest', stepMinutes: 15, scope: 'day' },
  projects: [{ id: 'prj-acme-api', name: 'acme-api' }],
  rules: [],
};

/** A meeting and a commit of the same client that overlap: one merged block. */
const MEETING: Proof = {
  id: 'ics:acme-sync',
  source: 'calendar',
  kind: 'meeting',
  clientId: 'cli-acme',
  start: at(3, 10, 0),
  end: at(3, 10, 30),
  title: 'Acme sync',
  attendees: [{ email: 'malik@example.org', partStat: 'accepted' }],
  status: 'confirmed',
};

const COMMIT: Proof = {
  id: 'git:acme-api:abc123',
  source: 'git',
  kind: 'commit',
  clientId: 'cli-acme',
  at: at(3, 10, 20),
  repo: 'acme-api',
  branch: 'feat/billing',
  summary: 'Add invoice rounding',
  added: 42,
  deleted: 7,
  authorEmail: 'sofia@example.com',
};

function Seed(props: { readonly proofs: readonly Proof[] }): null {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch({ type: 'upsertClient', client: ACME });
    dispatch({ type: 'importEvidence', evidence: props.proofs });
  }, [dispatch, props.proofs]);
  return null;
}

function renderEvidence(proofs: readonly Proof[]): void {
  render(
    <AppProvider>
      <I18nProvider>
        <Seed proofs={proofs} />
        <Evidence />
      </I18nProvider>
    </AppProvider>,
  );
}

/** The empty state offers one button per block of the month: click the first. */
async function openTheBlock(): Promise<void> {
  const open = await waitFor(() =>
    screen.getByRole('button', { name: 'Open the evidence of this block' }),
  );
  await userEvent.setup().click(open);
}

describe('Evidence', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  it('explains what to do while no block is selected', async () => {
    renderEvidence([MEETING, COMMIT]);
    await waitFor(() => {
      expect(screen.getByText('Select a block to see the proofs it rests on.')).toBeDefined();
    });
    expect(
      screen.getByRole('button', { name: 'Open the evidence of this block' }),
    ).toBeDefined();
  });

  it('lists the commit and the meeting of the block with their instants and fields', async () => {
    renderEvidence([MEETING, COMMIT]);
    await openTheBlock();

    const list = await waitFor(() => screen.getByRole('list', { name: 'Evidence' }));
    expect(within(list).getByText('Commit')).toBeDefined();
    expect(within(list).getByText('Meeting')).toBeDefined();
    expect(within(list).getByText(/10:20/)).toBeDefined();
    expect(within(list).getByText(/10:00/)).toBeDefined();
    expect(within(list).getByText('Add invoice rounding')).toBeDefined();
    expect(within(list).getByText('Acme sync')).toBeDefined();
    expect(within(list).getByText('acme-api')).toBeDefined();
    expect(within(list).getByText('feat/billing')).toBeDefined();
    expect(within(list).getByText('sofia@example.com')).toBeDefined();
    expect(within(list).getByText('malik@example.org')).toBeDefined();
    expect(within(list).getAllByText('42').length).toBeGreaterThan(0);
  });
});

describe('Evidence — the block panel', () => {
  afterEach(cleanup);

  it('stitches the proofs together, states both shares and goes back', async () => {
    renderEvidence([MEETING, COMMIT]);
    await openTheBlock();

    expect(screen.getByLabelText('Stitch')).toBeDefined();
    expect(screen.getByText('Proven')).toBeDefined();
    expect(screen.getByText('Assumed')).toBeDefined();
    expect(screen.getByText('30m')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Acme' })).toBeDefined();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => {
      expect(screen.getByText('Select a block to see the proofs it rests on.')).toBeDefined();
    });
  });

  it('shows the file and the line of a note proof', async () => {
    const note: Proof = {
      id: 'note:2026-11-04:7',
      source: 'note',
      kind: 'note',
      clientId: 'cli-acme',
      at: at(4, 9, 5),
      file: 'notes/2026-11-04.md',
      line: 7,
      text: 'Checked the tax rate with Malik',
      tag: 'acme',
    };
    renderEvidence([note]);
    await openTheBlock();

    const list = await waitFor(() => screen.getByRole('list', { name: 'Evidence' }));
    expect(within(list).getByText('Note')).toBeDefined();
    expect(within(list).getByText(/09:05/)).toBeDefined();
    expect(within(list).getByText('notes/2026-11-04.md')).toBeDefined();
    expect(within(list).getAllByText('Line').length).toBeGreaterThan(0);
  });
});
