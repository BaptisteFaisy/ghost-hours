import { describe, expect, it } from 'vitest';
import { applyRules, matchRuleFor, resolveProjectId, inferProjectId, makeClient } from './index.ts';
import { acmeClient, allClients, commit, globexClient, meeting, note, northwindClient, rule } from './testkit.ts';

describe('applyRules — attribution', () => {
  it('maps by repository and leaves the rest orphan', () => {
    const result = applyRules([commit(), meeting({ title: 'Unrelated call', attendees: [] })], allClients());
    expect(result.mapped.map((item) => item.clientId)).toEqual(['cli-acme']);
    expect(result.orphans.map((item) => item.id)).toEqual(['ics:weekly-1:0']);
  });

  it('maps a note through its tag', () => {
    const result = applyRules([note()], allClients());
    expect(result.mapped[0]?.clientId).toBe('cli-globex');
  });

  it('maps a meeting through an attendee domain', () => {
    const clients = [acmeClient([rule('cli-acme', 'attendee-domain', 'acme.example.org')])];
    expect(applyRules([meeting()], clients).mapped[0]?.clientId).toBe('cli-acme');
  });

  it('keeps an existing clientId that still exists (HEU-P-14)', () => {
    const already = commit({ clientId: 'cli-northwind' });
    const result = applyRules([already], allClients());
    expect(result.mapped[0]?.clientId).toBe('cli-northwind');
  });

  it('re-runs the rules when the stored client no longer exists', () => {
    const stale = commit({ clientId: 'cli-deleted' });
    expect(applyRules([stale], allClients()).mapped[0]?.clientId).toBe('cli-acme');
    expect(applyRules([stale], []).orphans).toHaveLength(1);
  });

  it('never invents a client: an unknown rule target stays orphan', () => {
    const stranger = { ...acmeClient(), rules: [rule('cli-ghost', 'repo', 'acme-api')] };
    expect(applyRules([commit()], [stranger]).orphans).toHaveLength(1);
  });
});

describe('applyRules — precedence', () => {
  const acme = acmeClient([
    rule('cli-acme', 'title-contains', 'Weekly'),
    rule('cli-acme', 'attendee-domain', 'acme.example.org'),
  ]);
  const globex = globexClient([rule('cli-globex', 'title-contains', 'Weekly')]);

  it('repo wins over title and domain, whatever the client order', () => {
    const event = meeting({ repo: 'acme-api' });
    for (const clients of [[acme, globex], [globex, acme]]) {
      expect(applyRules([event], clients).mapped[0]?.clientId).toBe('cli-acme');
    }
  });

  it('attendee-domain wins over title', () => {
    const clients = [globex, acme];
    expect(applyRules([meeting()], clients).mapped[0]?.clientId).toBe('cli-acme');
  });

  it('uses the caller precedence when one is given', () => {
    const clients = [globex, acme];
    const result = applyRules([meeting()], clients, ['title-contains', 'attendee-domain']);
    expect(result.mapped[0]?.clientId).toBe('cli-globex');
  });

  it('at equal priority, the order of clients decides, then the order of rules', () => {
    const first = northwindClient([rule('cli-northwind', 'title-contains', 'Weekly')]);
    const second = globexClient([rule('cli-globex', 'title-contains', 'Weekly')]);
    const event = meeting({ attendees: [], organizerEmail: undefined });
    expect(applyRules([event], [first, second]).mapped[0]?.clientId).toBe('cli-northwind');
    expect(applyRules([event], [second, first]).mapped[0]?.clientId).toBe('cli-globex');
    const other = globexClient([
      rule('cli-globex', 'title-contains', 'nothing'),
      rule('cli-globex', 'title-contains', 'Weekly'),
    ]);
    expect(matchRuleFor(event, [other])?.rule.value).toBe('Weekly');
  });

  it('reports the rule and the client that matched', () => {
    const match = matchRuleFor(commit(), allClients());
    expect(match?.client.id).toBe('cli-acme');
    expect(match?.rule.type).toBe('repo');
  });

  it('returns null when nothing matches', () => {
    expect(matchRuleFor(meeting({ attendees: [], title: 'Lunch' }), allClients())).toBeNull();
  });
});

describe('applyRules — projects', () => {
  it('infers the project from the repository name', () => {
    const result = applyRules([commit()], allClients());
    expect(result.mapped[0]?.projectId).toBe('prj-acme-api');
  });

  it('prefers the project named by the rule', () => {
    const client = makeClient({
      id: 'cli-acme',
      name: 'Acme',
      projects: [{ id: 'prj-acme-api', name: 'Acme API' }],
      rules: [rule('cli-acme', 'repo', 'acme-api', 'prj-other')],
    });
    expect(applyRules([commit()], [client]).mapped[0]?.projectId).toBe('prj-other');
  });

  it('keeps an explicit project and falls back to null', () => {
    expect(inferProjectId('globex-etl', acmeClient())).toBeNull();
    expect(inferProjectId(undefined, acmeClient())).toBeNull();
    expect(resolveProjectId(commit({ projectId: 'prj-kept' }), acmeClient(), null)).toBe('prj-kept');
    expect(resolveProjectId(commit({ repo: 'northwind-portal' }), acmeClient(), null)).toBeNull();
  });
});

describe('applyRules — output shape', () => {
  it('sorts mapped and orphan evidence by instant then id', () => {
    const late = commit({ id: 'git:acme-api:zzz', at: Date.UTC(2026, 10, 4, 9, 0) });
    const early = commit({ id: 'git:acme-api:aaa', at: Date.UTC(2026, 10, 3, 9, 0) });
    const result = applyRules([late, early], allClients());
    expect(result.mapped.map((item) => item.id)).toEqual(['git:acme-api:aaa', 'git:acme-api:zzz']);
  });

  it('does not mutate the input evidence or clients', () => {
    const input = commit();
    const clients = allClients();
    const snapshot = JSON.stringify({ input, clients });
    applyRules([input], clients);
    expect(JSON.stringify({ input, clients })).toBe(snapshot);
  });

  it('returns empty lists for empty input', () => {
    expect(applyRules([], allClients())).toEqual({ mapped: [], orphans: [] });
    expect(applyRules([commit()], [])).toEqual({ mapped: [], orphans: [commit()] });
  });
});
