import { ruleId } from '@ghost-hours/core';
import type { Client, Evidence, MappingRule } from '@ghost-hours/core';
import { makeClient, makeProject } from './clients.ts';

/**
 * Fictitious fixtures shared by the mapping tests (HEU-N-06).
 *
 * Names, domains and repositories are the ones the build contract allows:
 * `Acme`, `Northwind`, `Globex`, `example.com`/`example.org`, `acme-api`,
 * `northwind-portal`.
 */

export function rule(clientId: string, type: MappingRule['type'], value: string, projectId?: string): MappingRule {
  return { id: ruleId(clientId, type, value), clientId, type, value, projectId: projectId ?? null };
}

export function acmeClient(extraRules: readonly MappingRule[] = []): Client {
  return makeClient({
    id: 'cli-acme',
    name: 'Acme',
    projects: [{ id: 'prj-acme-api', name: 'Acme API' }],
    rules: [rule('cli-acme', 'repo', 'acme-api', 'prj-acme-api'), ...extraRules],
  });
}

export function northwindClient(extraRules: readonly MappingRule[] = []): Client {
  return makeClient({
    id: 'cli-northwind',
    name: 'Northwind',
    mode: 'daily-thresholds',
    dayRateCents: 90_000,
    projects: [{ id: 'prj-northwind-portal', name: 'Northwind Portal' }],
    rules: [rule('cli-northwind', 'repo', 'northwind-portal', 'prj-northwind-portal'), ...extraRules],
  });
}

export function globexClient(extraRules: readonly MappingRule[] = []): Client {
  return makeClient({
    id: 'cli-globex',
    name: 'Globex',
    projects: [{ id: 'prj-globex-etl', name: 'Globex ETL' }],
    rules: [rule('cli-globex', 'note-tag', 'globex'), ...extraRules],
  });
}

export function allClients(): readonly Client[] {
  return [acmeClient(), northwindClient(), globexClient()];
}

export function commit(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: 'git:acme-api:3ab91c0',
    source: 'git',
    kind: 'commit',
    clientId: null,
    at: Date.UTC(2026, 10, 3, 15, 41),
    repo: 'acme-api',
    remote: 'example.com/acme/api',
    branch: 'feat/export',
    summary: 'Add CSV export',
    ...overrides,
  };
}

export function meeting(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: 'ics:weekly-1:0',
    source: 'calendar',
    kind: 'meeting',
    clientId: null,
    start: Date.UTC(2026, 10, 3, 10, 0),
    end: Date.UTC(2026, 10, 3, 10, 30),
    title: 'Weekly review',
    attendees: [{ email: 'sarah@acme.example.org', partStat: 'accepted' }],
    organizerEmail: 'sofia@example.com',
    status: 'confirmed',
    ...overrides,
  };
}

export function note(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: 'note:2026-11-03.md:1:1',
    source: 'note',
    kind: 'note',
    clientId: null,
    at: Date.UTC(2026, 10, 3, 13, 2),
    file: '2026-11-03.md',
    line: 1,
    text: 'Exported the ledger',
    tag: 'globex',
    ...overrides,
  };
}

/** A client with no rule at all: nothing can ever map to it. */
export function bareClient(): Client {
  return makeClient({ id: 'cli-bare', name: 'Initech', projects: [{ name: 'Nothing' }] });
}

export { makeProject };
