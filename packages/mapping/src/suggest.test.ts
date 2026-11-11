import { describe, expect, it } from 'vitest';
import { applyRules, ruleMatches, suggestCandidates, suggestRule } from './index.ts';
import type { Evidence } from '@ghost-hours/core';
import { acmeClient, allClients, commit, globexClient, meeting, note, northwindClient, rule } from './testkit.ts';

describe('suggestRule — one gesture (HEU-F-09)', () => {
  it('suggests a repo rule for a commit, and that rule matches it', () => {
    const suggested = suggestRule(commit(), 'cli-acme');
    expect(suggested.type).toBe('repo');
    expect(suggested.value).toBe('acme-api');
    expect(suggested.projectId).toBeNull();
    expect(ruleMatches(suggested, commit())).toBe(true);
  });

  it('maps the evidence once the rule is installed', () => {
    const evidence = commit({ repo: 'northwind-portal', remote: 'example.com/northwind/portal' });
    const suggested = suggestRule(evidence, 'cli-northwind', 'prj-northwind-portal');
    const client = { ...northwindClient(), rules: [suggested] };
    const result = applyRules([evidence], [client]);
    expect(result.mapped[0]?.clientId).toBe('cli-northwind');
    expect(result.mapped[0]?.projectId).toBe('prj-northwind-portal');
  });

  it('suggests the tag of a note', () => {
    const suggested = suggestRule(note(), 'cli-globex');
    expect(suggested.type).toBe('note-tag');
    expect(suggested.value).toBe('globex');
    expect(ruleMatches(suggested, note())).toBe(true);
  });

  it('suggests the attendee domain of a meeting', () => {
    const suggested = suggestRule(meeting(), 'cli-acme');
    expect(suggested.type).toBe('attendee-domain');
    expect(suggested.value).toBe('acme.example.org');
    expect(ruleMatches(suggested, meeting())).toBe(true);
  });

  it('falls back to the title, then to a manual rule', () => {
    const event = meeting({ attendees: [], organizerEmail: undefined });
    const suggested = suggestRule(event, 'cli-acme');
    expect(suggested.type).toBe('title-contains');
    expect(ruleMatches(suggested, event)).toBe(true);
    const bare: Evidence = { id: 'git:unknown:1', source: 'git', kind: 'commit', clientId: null, at: 0 };
    const manual = suggestRule(bare, 'cli-acme');
    expect(manual.type).toBe('manual');
    expect(manual.value).toBe('git:unknown:1');
    expect(ruleMatches(manual, bare)).toBe(true);
  });

  it('suggests a remote fragment when the repository name is absent', () => {
    const suggested = suggestRule(commit({ repo: undefined }), 'cli-acme');
    expect(suggested.type).toBe('remote-contains');
    expect(suggested.value).toBe('acme/api');
    expect(ruleMatches(suggested, commit({ repo: undefined }))).toBe(true);
  });

  it('gives a rule a deterministic id', () => {
    expect(suggestRule(commit(), 'cli-acme').id).toBe(suggestRule(commit(), 'cli-acme').id);
    expect(suggestRule(commit(), 'cli-acme').id).not.toBe(suggestRule(commit(), 'cli-globex').id);
  });
});

describe('suggestCandidates — heuristics, no model, no network', () => {
  it('ranks the client whose project matches the repository first', () => {
    const candidates = suggestCandidates(commit(), allClients());
    expect(candidates[0]?.clientId).toBe('cli-acme');
    expect(candidates[0]?.reason).toContain('acme-api');
    expect(candidates[0]?.confidence).toBeGreaterThan(0.5);
  });

  it('recognizes a note tag', () => {
    const candidates = suggestCandidates(note(), allClients());
    expect(candidates[0]?.clientId).toBe('cli-globex');
    expect(candidates[0]?.reason).toContain('note tag');
  });

  it('recognizes an attendee domain and a title word', () => {
    const byDomain = suggestCandidates(meeting(), allClients());
    expect(byDomain[0]?.clientId).toBe('cli-acme');
    const byTitle = suggestCandidates(meeting({ attendees: [], title: 'Northwind kickoff' }), allClients());
    expect(byTitle[0]?.clientId).toBe('cli-northwind');
  });

  it('returns nothing when no client name or project appears', () => {
    const stranger = commit({ repo: 'zzz-unknown', remote: 'example.net/zzz/unknown', summary: 'x' });
    expect(suggestCandidates(stranger, [acmeClient(), globexClient()])).toEqual([]);
  });

  it('sorts by confidence, then by client id, and scores within [0, 1]', () => {
    const clients = [northwindClient(), acmeClient(), globexClient()];
    const candidates = suggestCandidates(commit(), clients);
    for (let i = 1; i < candidates.length; i += 1) {
      const previous = candidates[i - 1];
      const current = candidates[i];
      expect(previous?.confidence ?? 0).toBeGreaterThanOrEqual(current?.confidence ?? 0);
    }
    for (const candidate of candidates) {
      expect(candidate.confidence).toBeGreaterThan(0);
      expect(candidate.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic and independent of the client order', () => {
    const forward = suggestCandidates(commit(), allClients());
    const backward = suggestCandidates(commit(), [...allClients()].reverse());
    expect(forward).toEqual(backward);
  });
});

describe('suggestRule + precedence', () => {
  it('a suggested repo rule beats an older title rule', () => {
    const withTitle = acmeClient([rule('cli-acme', 'title-contains', 'Weekly')]);
    const suggested = suggestRule(commit(), 'cli-acme');
    const client = { ...withTitle, rules: [...withTitle.rules, suggested] };
    expect(applyRules([commit()], [client]).mapped[0]?.projectId).toBe('prj-acme-api');
  });
});
