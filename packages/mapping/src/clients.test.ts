import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUNDING } from '@ghost-hours/core';
import { makeClient, makeProject, removeRule, ruleIdentity, upsertRule } from './index.ts';
import { acmeClient, allClients, globexClient, rule } from './testkit.ts';

describe('makeClient — immutable factory (HEU-F-07)', () => {
  it('fills sensible defaults and copies the nested values', () => {
    const rounding = { mode: 'up', stepMinutes: 30, scope: 'total' } as const;
    const client = makeClient({ name: ' Acme ', rounding, projects: [{ name: 'Acme API' }] });
    expect(client.name).toBe('Acme');
    expect(client.mode).toBe('hourly');
    expect(client.currency).toBe('EUR');
    expect(client.rateCents).toBe(0);
    expect(client.rounding).toEqual(rounding);
    expect(client.rounding).not.toBe(rounding);
    expect(client.rules).toEqual([]);
  });

  it('uses the domain default rounding when none is given', () => {
    expect(makeClient({ name: 'Acme' }).rounding).toEqual(DEFAULT_ROUNDING);
  });

  it('gives a random client id but a deterministic project id', () => {
    const first = makeClient({ name: 'Acme' });
    const second = makeClient({ name: 'Acme' });
    expect(first.id).not.toBe(second.id);
    expect(first.id).toMatch(/^cli_/);
    expect(makeProject('Acme API').id).toBe(makeProject('Acme API').id);
    expect(makeProject('Acme API').id).toBe(makeProject('acme  api').id);
    expect(makeProject('Acme API').id).not.toBe(makeProject('Acme ETL').id);
  });

  it('keeps an injected id', () => {
    expect(makeClient({ id: 'cli-acme', name: 'Acme' }).id).toBe('cli-acme');
  });
});

describe('upsertRule — immutable and idempotent', () => {
  it('adds the rule to its client only', () => {
    const clients = allClients();
    const added = upsertRule(clients, rule('cli-acme', 'title-contains', 'Weekly'));
    expect(clients[0]?.rules).toHaveLength(1);
    expect(added[0]?.rules).toHaveLength(2);
    expect(added[1]).toBe(clients[1]);
  });

  it('replaces an existing rule with the same id instead of duplicating it', () => {
    const clients = [acmeClient()];
    const once = upsertRule(clients, rule('cli-acme', 'title-contains', 'Weekly'));
    const twice = upsertRule(once, rule('cli-acme', 'title-contains', 'Weekly'));
    expect(twice[0]?.rules).toHaveLength(2);
    expect(twice).toEqual(once);
  });

  it('replaces the payload when the same id carries a new project', () => {
    const clients = [acmeClient()];
    const updated = upsertRule(clients, rule('cli-acme', 'repo', 'acme-api', 'prj-other'));
    expect(updated[0]?.rules).toHaveLength(1);
    expect(updated[0]?.rules[0]?.projectId).toBe('prj-other');
    expect(clients[0]?.rules[0]?.projectId).toBe('prj-acme-api');
  });

  it('ignores a rule aimed at an unknown client', () => {
    const clients = allClients();
    expect(upsertRule(clients, rule('cli-ghost', 'repo', 'acme-api'))).toEqual(clients);
  });

  it('does not mutate its input', () => {
    const clients = allClients();
    const snapshot = JSON.stringify(clients);
    upsertRule(clients, rule('cli-globex', 'title-contains', 'Weekly'));
    removeRule(clients, 'whatever');
    expect(JSON.stringify(clients)).toBe(snapshot);
  });
});

describe('removeRule — immutable and idempotent', () => {
  it('removes the rule and leaves the other clients untouched', () => {
    const clients = [acmeClient(), globexClient()];
    const target = clients[0]?.rules[0]?.id ?? '';
    const removed = removeRule(clients, target);
    expect(removed[0]?.rules).toEqual([]);
    expect(removed[1]).toBe(clients[1]);
    expect(clients[0]?.rules).toHaveLength(1);
  });

  it('is idempotent and tolerates an unknown id', () => {
    const clients = [acmeClient()];
    const once = removeRule(clients, clients[0]?.rules[0]?.id ?? '');
    expect(removeRule(once, 'rule:unknown')).toEqual(once);
    expect(once).toEqual([{ ...clients[0], rules: [] }]);
  });
});

describe('ruleIdentity', () => {
  it('is stable and case insensitive on the value', () => {
    expect(ruleIdentity('cli-acme', 'repo', 'acme-api')).toBe(ruleIdentity('cli-acme', 'repo', 'ACME-API'));
    expect(ruleIdentity('cli-acme', 'repo', 'acme-api')).not.toBe(ruleIdentity('cli-globex', 'repo', 'acme-api'));
  });
});
