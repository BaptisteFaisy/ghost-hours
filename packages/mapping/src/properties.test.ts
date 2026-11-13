import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { Client, Evidence } from '@ghost-hours/core';
import { applyRules } from './index.ts';
import type { MappingResult } from './index.ts';
import { acmeClient, commit, globexClient, note, northwindClient, rule } from './testkit.ts';

/** Clients whose rules never compete: the order-independence property holds. */
function disjointClients(): readonly Client[] {
  return [acmeClient(), northwindClient(), globexClient()];
}

const repoArb = fc.constantFrom('acme-api', 'northwind-portal', 'globex-etl', 'unknown-repo');

const evidenceArb: fc.Arbitrary<Evidence> = fc
  .record({
    id: fc.stringMatching(/^[a-z]{1,8}$/).map((value) => `git:${value}`),
    repo: repoArb,
    at: fc.integer({ min: Date.UTC(2026, 10, 1), max: Date.UTC(2026, 10, 30) }),
  })
  .map((raw) => ({ ...raw, source: 'git' as const, kind: 'commit' as const, clientId: null }));

const tagArb: fc.Arbitrary<Evidence> = fc
  .constantFrom('acme', 'northwind', 'globex', 'other')
  .map((tag) => note({ id: `note:${tag}`, tag }));

const anyEvidence = fc.oneof(evidenceArb, tagArb, fc.constant(commit()));

/** Identity of the attribution: what the rules decided, not the array order. */
function assignment(result: MappingResult): readonly string[] {
  return [...result.mapped, ...result.orphans]
    .map((item) => `${item.id}=${item.clientId ?? '-'}/${item.projectId ?? '-'}`)
    .sort();
}

describe('applyRules — determinism (HEU-P-03, HEU-P-14, HEU-F-16)', () => {
  it('HEU-P-14: applying the rules twice changes nothing', () => {
    fc.assert(
      fc.property(fc.array(anyEvidence, { maxLength: 12 }), (evidence) => {
        const once = applyRules(evidence, disjointClients());
        const twice = applyRules([...once.mapped, ...once.orphans], disjointClients());
        expect(assignment(twice)).toEqual(assignment(once));
        expect(twice.mapped).toHaveLength(once.mapped.length);
      }),
    );
  });

  it('HEU-P-03: the attribution does not depend on the evidence order', () => {
    fc.assert(
      fc.property(fc.array(anyEvidence, { maxLength: 12 }), (evidence) => {
        const forward = applyRules(evidence, disjointClients());
        const backward = applyRules([...evidence].reverse(), disjointClients());
        expect(assignment(backward)).toEqual(assignment(forward));
        expect(backward.mapped).toEqual(forward.mapped);
        expect(backward.orphans).toEqual(forward.orphans);
      }),
    );
  });

  it('HEU-F-16: the attribution does not depend on the client order', () => {
    fc.assert(
      fc.property(fc.array(anyEvidence, { maxLength: 12 }), (evidence) => {
        const forward = applyRules(evidence, disjointClients());
        const backward = applyRules(evidence, [...disjointClients()].reverse());
        expect(assignment(backward)).toEqual(assignment(forward));
      }),
    );
  });
});

describe('applyRules — safety (HEU-F-09)', () => {
  it('never invents a client: every produced clientId exists in the input', () => {
    fc.assert(
      fc.property(fc.array(anyEvidence, { maxLength: 12 }), (evidence) => {
        const clients = disjointClients();
        const known = new Set(clients.map((client) => client.id));
        for (const item of applyRules(evidence, clients).mapped) {
          expect(item.clientId === null ? null : known.has(item.clientId)).toBe(true);
        }
      }),
    );
  });

  it('drops a stale stored clientId and falls back to the rules', () => {
    fc.assert(
      fc.property(anyEvidence, fc.constantFrom('cli-gone', 'cli-also-gone'), (evidence, ghost) => {
        const result = applyRules([{ ...evidence, clientId: ghost }], disjointClients());
        for (const item of result.mapped) expect(item.clientId).not.toBe(ghost);
      }),
    );
  });

  it('an orphan stays orphan while no rule covers it', () => {
    fc.assert(
      fc.property(anyEvidence, (evidence) => {
        const clients = disjointClients();
        const first = applyRules([evidence], clients);
        if (first.mapped.length === 1) return;
        const again = applyRules([evidence], clients);
        expect(again.orphans).toHaveLength(1);
        expect(again.mapped).toEqual([]);
      }),
    );
  });

  it('adding a rule never turns a mapped evidence into an orphan', () => {
    fc.assert(
      fc.property(anyEvidence, fc.stringMatching(/^[a-z]{2,8}$/), (evidence, value) => {
        const before = applyRules([evidence], disjointClients());
        const withRule = disjointClients().map((client) =>
          client.id === 'cli-globex'
            ? { ...client, rules: [...client.rules, rule('cli-globex', 'title-contains', value)] }
            : client,
        );
        const after = applyRules([evidence], withRule);
        if (before.mapped.length === 1) expect(after.mapped).toHaveLength(1);
      }),
    );
  });
});
