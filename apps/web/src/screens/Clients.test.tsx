// @vitest-environment jsdom
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS, zonedTimeToInstant } from '@ghost-hours/core';
import type { Client, Evidence } from '@ghost-hours/core';
import { AppProvider, useDispatch } from '../state/store.tsx';
import { I18nProvider } from '../i18n/index.ts';
import { Clients } from './Clients.tsx';
import { clearBrowserStorage, stubBrowserStorage } from '../components/testSupport.ts';

/**
 * The clients screen (D.7 P3, HEU-F-07/08/09): a client is created through
 * the form with its billing terms, and an orphan proof is associated to a
 * suggested client in one gesture — the rule appears on the client and the
 * proof leaves the orphan list.
 */

const TZ = DEFAULT_SETTINGS.timeZone;

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

/** A proof no rule claims: it lands in `state.orphanEvidence`. */
const ORPHAN_COMMIT: Evidence = {
  id: 'git:acme-api:orphan1',
  source: 'git',
  kind: 'commit',
  clientId: null,
  at: zonedTimeToInstant({ year: 2026, month: 11, day: 5, hour: 15, minute: 30 }, TZ),
  repo: 'acme-api',
  branch: 'main',
  summary: 'Wire billing summary',
};

function Seed(props: { readonly orphans: boolean }): null {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch({ type: 'upsertClient', client: ACME });
    if (props.orphans) dispatch({ type: 'importEvidence', evidence: [ORPHAN_COMMIT] });
  }, [dispatch, props.orphans]);
  return null;
}

function renderClients(orphans: boolean): void {
  render(
    <AppProvider>
      <I18nProvider>
        <Seed orphans={orphans} />
        <Clients />
      </I18nProvider>
    </AppProvider>,
  );
}

describe('Clients', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  it('creates a client from the form and shows a plain error when the rate is missing', async () => {
    renderClients(false);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Name'), 'Northwind');
    await user.type(screen.getByLabelText('Projects'), 'northwind-portal');
    await user.click(screen.getByRole('button', { name: 'Add a client' }));
    expect(screen.getByRole('alert').textContent).toContain('positive amount');
    expect(screen.getByLabelText('Name')).toHaveProperty('value', 'Northwind');

    await user.type(screen.getByLabelText('Hourly rate'), '75');
    await user.click(screen.getByRole('button', { name: 'Add a client' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Northwind' })).toBeDefined();
    });
    expect(screen.getByText('northwind-portal')).toBeDefined();
    expect(screen.getByText('€75.00')).toBeDefined();
    expect(screen.getAllByText('Hourly').length).toBeGreaterThan(0);
  });

  it('associates an orphan proof in one gesture: the rule is created and the proof leaves the list', async () => {
    renderClients(true);
    const orphans = await waitFor(() => screen.getByRole('list', { name: 'Unassigned evidence' }));
    expect(within(orphans).getByText('Wire billing summary')).toBeDefined();

    const associate = within(orphans).getByRole('button', {
      name: 'Associate to this client — Acme',
    });
    expect(within(orphans).getByText(/repository acme-api is the project acme-api/)).toBeDefined();

    await userEvent.setup().click(associate);

    await waitFor(() => {
      expect(screen.getByText('Every proof has a client.')).toBeDefined();
    });
    expect(within(orphans).queryByText('Wire billing summary')).toBeNull();

    const rules = screen.getByRole('table');
    expect(within(rules).getByRole('cell', { name: 'Repository' })).toBeDefined();
    expect(within(rules).getByRole('cell', { name: 'acme-api' })).toBeDefined();

    // The rule can be removed again: the table goes back to no rule at all.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove this rule — acme-api' }));
    await waitFor(() => {
      expect(screen.queryByRole('cell', { name: 'acme-api' })).toBeNull();
    });
    // The proof stays with Acme: it carries the client it was attributed to
    // (HEU-P-14 — re-running the rules never unmakes an attribution).
    expect(within(orphans).queryByText('Wire billing summary')).toBeNull();
  });
});
