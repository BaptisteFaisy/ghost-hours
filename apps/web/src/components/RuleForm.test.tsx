// @vitest-environment jsdom
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Client } from '@ghost-hours/core';
import { AppProvider, useDispatch } from '../state/store.tsx';
import { I18nProvider } from '../i18n/index.ts';
import { Clients } from '../screens/Clients.tsx';
import { clearBrowserStorage, stubBrowserStorage } from './testSupport.ts';

/**
 * The rule form (HEU-F-08): a rule written by hand for a client appears in
 * the rules list of that client, and writing the same rule twice leaves a
 * single row — the id derived by `ruleIdentity` makes the upsert idempotent.
 */

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

function Seed(): null {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch({ type: 'upsertClient', client: ACME });
  }, [dispatch]);
  return null;
}

function renderClients(): void {
  render(
    <AppProvider>
      <I18nProvider>
        <Seed />
        <Clients />
      </I18nProvider>
    </AppProvider>,
  );
}

/** Fills the rule form of the only client and submits it. */
async function addRule(type: string, value: string): Promise<void> {
  const form = screen.getByRole('form', { name: 'Add a rule' });
  const user = userEvent.setup();
  await user.selectOptions(within(form).getByLabelText('Rule'), type);
  await user.type(within(form).getByLabelText('Value'), value);
  await user.click(within(form).getByRole('button', { name: 'Add a rule' }));
}

describe('RuleForm — a rule written by hand', () => {
  afterEach(cleanup);

  beforeEach(() => {
    stubBrowserStorage();
    clearBrowserStorage();
  });

  it('adds a rule that appears in the rules list of the client', async () => {
    renderClients();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Acme' })).toBeDefined());

    await addRule('note-tag', 'acme');

    await waitFor(() => expect(screen.getByRole('table')).toBeDefined());
    const rules = screen.getByRole('table');
    expect(within(rules).getByRole('cell', { name: 'Note tag' })).toBeDefined();
    expect(within(rules).getByRole('cell', { name: 'acme' })).toBeDefined();
    // The value field is emptied, ready for the next rule.
    const form = screen.getByRole('form', { name: 'Add a rule' });
    expect(within(form).getByLabelText('Value')).toHaveProperty('value', '');
  });

  it('writes the same rule once: adding it twice leaves a single row', async () => {
    renderClients();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Acme' })).toBeDefined());

    await addRule('repo', 'acme-api');
    await waitFor(() => expect(screen.getByRole('table')).toBeDefined());
    await addRule('repo', 'acme-api');

    await waitFor(() => {
      expect(screen.getAllByRole('cell', { name: 'acme-api' })).toHaveLength(1);
    });
    expect(screen.getAllByRole('cell', { name: 'Repository' })).toHaveLength(1);
  });
});
