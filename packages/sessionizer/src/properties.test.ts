import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { dayKeyInZone, dayRangeInZone } from '@ghost-hours/core';
import { makeInterval, overlaps } from '@ghost-hours/intervals';
import { sessionize } from './algorithm.ts';
import { workdayStartAt } from './sessions.ts';
import type { Evidence } from '@ghost-hours/core';
import { CLIENTS, TZ, at, commit, lockedBlock, meeting, note, settings } from './test-support.ts';

/** Five days of realistic work: 5-minute granularity, two clients. */
const STEP_MS = 5 * 60_000;
const WINDOW_START = at(3, 7);
const instantOf = (q: number): number => WINDOW_START + q * STEP_MS;
const MAX_Q = (5 * 24 * 60) / 5;

const pointsOf = (clientId: string): fc.Arbitrary<Evidence[]> =>
  fc
    .array(fc.record({ q: fc.integer({ min: 0, max: MAX_Q }), kind: fc.constantFrom('commit', 'note') }), { maxLength: 10 })
    .map((items) =>
      items.map((item, index) =>
        item.kind === 'commit' ? commit(`${clientId}-c${index}`, instantOf(item.q), clientId) : note(`${clientId}-n${index}`, instantOf(item.q), clientId),
      ),
    );

const meetingsOf = (clientId: string): fc.Arbitrary<Evidence[]> =>
  fc
    .array(fc.record({ q: fc.integer({ min: 0, max: MAX_Q }), length: fc.integer({ min: 1, max: 18 }) }), { maxLength: 3 })
    .map((items) =>
      items.map((item, index) => meeting(`${clientId}-m${index}`, instantOf(item.q), instantOf(item.q + item.length), clientId)),
    );

const pointsOfAcme = pointsOf('acme');
const meetingsOfAcme = meetingsOf('acme');
void pointsOfAcme;
void meetingsOfAcme;

const scenario: fc.Arbitrary<Evidence[]> = fc
  .tuple(pointsOf('acme'), pointsOf('northwind'), meetingsOf('acme'), meetingsOf('northwind'))
  .map(([acmePoints, northwindPoints, acmeMeetings, northwindMeetings]) => [
    ...acmePoints,
    ...northwindPoints,
    ...acmeMeetings,
    ...northwindMeetings,
  ]);

const run = (evidence: readonly Evidence[]) => sessionize({ clients: CLIENTS, settings, evidence });
const provenMinutes = (blocks: readonly { start: number; end: number; provenShare: number }[]): number =>
  blocks.reduce((sum, block) => sum + ((block.end - block.start) / 60_000) * block.provenShare, 0);

describe('HEU-P-01 — no two blocks ever overlap', () => {
  it('holds for any scenario', () => {
    fc.assert(
      fc.property(scenario, (evidence) => {
        // Conflicts are the one place where overlap is the point: the user
        // arbitrates, so HEU-P-01 covers proposed, confirmed and locked blocks.
        const blocks = run(evidence).blocks.filter((block) => block.status !== 'conflict');
        for (let i = 0; i < blocks.length; i += 1) {
          for (let j = i + 1; j < blocks.length; j += 1) {
            const a = blocks[i];
            const b = blocks[j];
            if (!a || !b) continue;
            expect(overlaps(makeInterval(a.start, a.end), makeInterval(b.start, b.end))).toBe(false);
          }
        }
      }),
      { numRuns: 60 },
    );
  });
});

describe('HEU-P-02 — a day holds no more than a day', () => {
  it('the per-day total equals the union duration and never exceeds the day', () => {
    fc.assert(
      fc.property(scenario, (evidence) => {
        const blocks = run(evidence).blocks.filter((block) => block.status !== 'conflict');
        const days = new Set(blocks.map((block) => dayKeyInZone(block.start, TZ)));
        for (const dayKey of days) {
          const day = dayRangeInZone(blocks.find((b) => dayKeyInZone(b.start, TZ) === dayKey)?.start ?? WINDOW_START, TZ);
          const clipped = blocks
            .map((block) => [Math.max(block.start, day.start), Math.min(block.end, day.end)] as const)
            .filter(([start, end]) => end > start);
          const sum = clipped.reduce((total, [start, end]) => total + (end - start), 0);
          const union = clipped
            .sort((a, b) => a[0] - b[0])
            .reduce<{ total: number; cursor: number }>(
              (acc, [start, end]) => ({ total: acc.total + Math.max(0, end - Math.max(start, acc.cursor)), cursor: Math.max(acc.cursor, end) }),
              { total: 0, cursor: Number.NEGATIVE_INFINITY },
            ).total;
          expect(sum).toBe(union);
          expect(sum).toBeLessThanOrEqual(day.end - day.start);
        }
      }),
      { numRuns: 40 },
    );
  });
});

describe('HEU-P-03 — the order of the evidence does not matter', () => {
  it('shuffling the input gives the same blocks and conflicts', () => {
    fc.assert(
      fc.property(scenario, fc.infiniteStream(fc.nat()), (evidence, seeds) => {
        const shuffled = [...evidence];
        for (let i = shuffled.length - 1; i > 0; i -= 1) {
          const j = (seeds.next().value ?? 0) % (i + 1);
          const a = shuffled[i];
          const b = shuffled[j];
          if (a && b) {
            shuffled[i] = b;
            shuffled[j] = a;
          }
        }
        const reference = run(evidence);
        const permuted = run(shuffled);
        expect(permuted.blocks).toEqual(reference.blocks);
        expect(permuted.conflicts).toEqual(reference.conflicts);
      }),
      { numRuns: 30 },
    );
  });
});

describe('HEU-P-04 — adding a proof never lowers the proven time', () => {
  it('is monotone for a single client', () => {
    const oneClient = fc.tuple(pointsOf('acme'), meetingsOf('acme')).map(([points, meetings]) => [...points, ...meetings]);
    fc.assert(
      fc.property(oneClient, fc.integer({ min: 0, max: MAX_Q }), (evidence, q) => {
        const before = provenMinutes(run(evidence).blocks);
        const after = provenMinutes(run([...evidence, commit('extra', instantOf(q), 'acme')]).blocks);
        expect(after).toBeGreaterThanOrEqual(before - 1e-9);
      }),
      { numRuns: 60 },
    );
  });

  it('is monotone with several clients while no new contradiction appears', () => {
    // With two clients, a new proof can create a contradiction; the tool then
    // shows a conflict instead of billing the minute, and the *counted* proven
    // time may drop. That is prudence working, not a regression: the property
    // is asserted whenever the added proof contradicts nothing.
    fc.assert(
      fc.property(scenario, fc.integer({ min: 0, max: MAX_Q }), (evidence, q) => {
        const before = run(evidence);
        const after = run([...evidence, commit('extra', instantOf(q), 'acme')]);
        if (after.conflicts.length > before.conflicts.length) return;
        expect(provenMinutes(after.blocks)).toBeGreaterThanOrEqual(provenMinutes(before.blocks) - 1e-9);
      }),
      { numRuns: 60 },
    );
  });
});

describe('HEU-P-05 — every mapped proof is accounted for', () => {
  it('sits in a block, in a conflict, or in the leftovers', () => {
    fc.assert(
      fc.property(scenario, (evidence) => {
        const result = run(evidence);
        const seen = new Set<string>([
          ...result.blocks.flatMap((block) => block.evidenceIds),
          ...result.conflicts.flatMap((conflict) => conflict.evidenceIds),
          ...result.orphanEvidence.map((item) => item.id),
        ]);
        for (const item of evidence) expect(seen.has(item.id)).toBe(true);
      }),
      { numRuns: 40 },
    );
  });
});

describe('HEU-P-06 — no block without proof', () => {
  it('every non-manual block holds at least one evidence id', () => {
    fc.assert(
      fc.property(scenario, (evidence) => {
        for (const block of run(evidence).blocks) {
          if (block.origin === 'manual') continue;
          expect(block.evidenceIds.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 40 },
    );
  });
});

describe('HEU-P-07 — an assumed lead-in stays bounded', () => {
  it('never starts before workdayStart and never exceeds leadInDefault', () => {
    fc.assert(
      fc.property(scenario, (evidence) => {
        for (const block of run(evidence).blocks) {
          if (block.assumedLeadInMinutes <= 0) continue;
          expect(block.start).toBeGreaterThanOrEqual(workdayStartAt(block.start, settings));
          expect(block.assumedLeadInMinutes).toBeLessThanOrEqual(settings.leadInDefaultMinutes);
        }
      }),
      { numRuns: 40 },
    );
  });
});

describe('HEU-P-13 — a locked block survives a new reconstruction', () => {
  it('comes back byte for byte', () => {
    const locked = lockedBlock(at(3, 9), at(3, 11), 'acme', ['acme-c0', 'acme-c1']);
    const evidence = [commit('acme-c0', at(3, 9)), commit('acme-c1', at(3, 11)), commit('acme-c2', at(3, 14))];
    const result = sessionize({ clients: CLIENTS, settings, evidence, lockedBlocks: [locked] });
    expect(result.blocks.find((block) => block.id === locked.id)).toEqual(locked);
  });
});

describe('HEU-P-14 — re-importing the same evidence changes nothing', () => {
  it('is idempotent', () => {
    fc.assert(
      fc.property(scenario, (evidence) => {
        const once = run(evidence);
        const twice = run([...evidence, ...evidence]);
        expect(twice.blocks).toEqual(once.blocks);
        expect(twice.conflicts).toEqual(once.conflicts);
      }),
      { numRuns: 25 },
    );
  });
});

describe('HEU-N-03 — 5 000 commits and 2 000 meetings in under two seconds', () => {
  it('stays inside the budget', () => {
    const evidence: Evidence[] = [];
    for (let i = 0; i < 5_000; i += 1) {
      evidence.push(commit(`p${i}`, WINDOW_START + i * 3 * 60_000, i % 2 === 0 ? 'acme' : 'northwind'));
    }
    for (let i = 0; i < 2_000; i += 1) {
      const start = WINDOW_START + i * 7 * 60_000;
      evidence.push(meeting(`m${i}`, start, start + 30 * 60_000, i % 2 === 0 ? 'northwind' : 'acme'));
    }
    const started = performance.now();
    const result = sessionize({ clients: CLIENTS, settings, evidence });
    const elapsed = performance.now() - started;
    expect(result.blocks.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(2_000);
  });
});
