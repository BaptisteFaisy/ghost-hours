import { describe, expect, it } from 'vitest';
import { resolveSettings } from '@ghost-hours/core';
import type { Evidence } from '@ghost-hours/core';
import { sessionize } from './algorithm.ts';
import {
  ACME,
  CLIENTS,
  NORTHWIND,
  TZ,
  at,
  checkout,
  commit,
  lockedBlock,
  manual,
  meeting,
  note,
  settings,
} from './test-support.ts';

const base = { clients: CLIENTS, settings };

describe('sessionize — sessions (D.5 steps 2-5)', () => {
  it('cuts a session when the gap exceeds gapMax, keeps it at exactly gapMax', () => {
    // 09:00 -> 09:30 -> 10:30: gaps of 30 and 60 minutes, one session.
    const sameGap = sessionize({ ...base, evidence: [commit('c1', at(3, 9)), commit('c2', at(3, 9, 30)), commit('c3', at(3, 10, 30))] });
    expect(sameGap.blocks).toHaveLength(1);
    // 09:00 -> 09:30 -> 11:01: the second gap is 91 minutes, one minute over gapMax.
    const twoSessions = sessionize({ ...base, evidence: [commit('c1', at(3, 9)), commit('c2', at(3, 9, 30)), commit('c4', at(3, 11, 1))] });
    expect(twoSessions.blocks).toHaveLength(2);
    expect(twoSessions.blocks[0]?.end).toBe(at(3, 9, 30));
    expect(twoSessions.blocks[1]?.start).toBe(at(3, 11, 1) - 30 * 60_000);
  });

  it('assumes a lead-in of leadInDefault and reports it', () => {
    const result = sessionize({ ...base, evidence: [commit('c1', at(3, 10)), commit('c2', at(3, 11))] });
    const block = result.blocks[0];
    expect(block?.start).toBe(at(3, 9, 30));
    expect(block?.assumedLeadInMinutes).toBe(30);
    // 60 proven minutes out of 90: "likely", never "solid".
    expect(block?.confidence).toBe('likely');
  });

  it('never starts an assumed lead-in before workdayStart', () => {
    const result = sessionize({ ...base, evidence: [commit('c1', at(3, 7, 10)), commit('c2', at(3, 7, 40))] });
    const block = result.blocks[0];
    expect(block?.start).toBe(at(3, 7));
    expect(block?.assumedLeadInMinutes).toBe(10);
  });

});

describe('sessionize — starts (D.5 step 4)', () => {
  it('uses a checkout of the same repository as the real start', () => {
    const evidence = [checkout('k1', at(3, 8, 50)), commit('c1', at(3, 9)), commit('c2', at(3, 10))];
    const block = sessionize({ ...base, evidence }).blocks[0];
    expect(block?.start).toBe(at(3, 8, 50));
    expect(block?.assumedLeadInMinutes).toBe(0);
  });

  it('ignores a checkout of another repository', () => {
    const evidence = [checkout('k1', at(3, 8, 50), 'acme', 'other-repo'), commit('c1', at(3, 9))];
    expect(sessionize({ ...base, evidence }).blocks[0]?.start).toBe(at(3, 8, 30));
  });

  it('says which constraint shortened the lead-in', () => {
    // Acme commits at 09:00, then Northwind at 09:10: the lead-in of the
    // second client is squeezed to nothing by the previous proof.
    const evidence = [
      commit('c1', at(3, 9)),
      commit('n1', at(3, 9, 10), 'northwind', 'northwind-portal'),
      commit('n2', at(3, 9, 40), 'northwind', 'northwind-portal'),
    ];
    const northwind = sessionize({ clients: CLIENTS, settings, evidence }).blocks.find(
      (block) => block.clientId === 'northwind',
    );
    expect(northwind?.assumedLeadInMinutes).toBe(10);
    expect(northwind?.reason).toEqual({ kind: 'assumed', minutes: 10, boundedBy: 'previous-proof' });
  });

  it('never starts before the previous proof of another client', () => {
    const evidence = [commit('n1', at(3, 9), 'northwind', 'northwind-portal'), commit('c1', at(3, 9, 20))];
    const northwind = sessionize({ ...base, evidence }).blocks.find((block) => block.clientId === 'northwind');
    const acme = sessionize({ ...base, evidence }).blocks.find((block) => block.clientId === 'acme');
    expect(northwind).toBeDefined();
    expect(acme?.start).toBe(at(3, 9));
  });

  it('treats notes as proofs and checkouts as markers only', () => {
    const evidence = [note('n1', at(3, 9)), note('n2', at(3, 10)), checkout('k1', at(3, 12))];
    const blocks = sessionize({ ...base, evidence }).blocks;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.evidenceIds).toEqual(['n1', 'n2']);
  });
});

describe('sessionize — meetings, overlaps, conflicts (D.5 steps 6-8)', () => {
  it('keeps a short meeting as an exact block', () => {
    const blocks = sessionize({ ...base, evidence: [meeting('m1', at(3, 11), at(3, 11, 20))] }).blocks;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.provenShare).toBe(1);
    expect(blocks[0]?.confidence).toBe('solid');
    expect(blocks[0]?.origin).toBe('meeting');
  });

  it('trims a session of another client with a meeting', () => {
    const evidence = [
      commit('c1', at(3, 9)),
      commit('c2', at(3, 10)),
      commit('c3', at(3, 11)),
      commit('c4', at(3, 12)),
      meeting('m1', at(3, 10), at(3, 11), 'northwind'),
    ];
    const blocks = sessionize({ ...base, evidence }).blocks.filter((block) => block.clientId === 'acme');
    // The assumed lead-in (08:30-09:00) is kept on the first piece: the
    // meeting only removes what it actually covers.
    expect(blocks.map((block) => [block.start, block.end])).toEqual([
      [at(3, 8, 30), at(3, 10)],
      [at(3, 11), at(3, 12)],
    ]);
  });

  it('raises a conflict when a proof falls inside another client meeting', () => {
    const evidence = [
      commit('c1', at(3, 10)),
      commit('c2', at(3, 10, 30)),
      meeting('m1', at(3, 10), at(3, 11), 'northwind'),
    ];
    const result = sessionize({ ...base, evidence });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.evidenceIds).toEqual(['c2']);
    expect(result.blocks.filter((block) => block.status === 'conflict')).toHaveLength(2);
  });

  it('merges a meeting and a session of the same client that touch', () => {
    const evidence = [meeting('m1', at(3, 9), at(3, 10)), commit('c1', at(3, 10)), commit('c2', at(3, 11))];
    const blocks = sessionize({ ...base, evidence }).blocks;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.origin).toBe('merged');
    expect(blocks[0]?.start).toBe(at(3, 9));
    expect(blocks[0]?.end).toBe(at(3, 11));
    // Sorted: a merged block never depends on the order the drafts met.
    expect(blocks[0]?.evidenceIds).toEqual(['c1', 'c2', 'm1']);
  });
});

describe('sessionize — prudence and leftovers (D.5 step 9)', () => {
  it('drops a session shorter than minSession and lists its proofs', () => {
    const tight = resolveSettings({ timeZone: TZ, leadInDefaultMinutes: 1, minSessionMinutes: 15 });
    const result = sessionize({ clients: CLIENTS, settings: tight, evidence: [commit('c1', at(3, 10)), commit('c2', at(3, 10, 5))] });
    expect(result.blocks).toHaveLength(0);
    expect(result.orphanEvidence.map((item) => item.id)).toEqual(['c1', 'c2']);
  });

});

describe('sessionize — locks, calibration, determinism (HEU-F-29, HEU-F-16)', () => {
  it('keeps locked blocks untouched and out of the computation', () => {
    const locked = lockedBlock(at(3, 9), at(3, 12), 'acme', ['c1', 'c2']);
    const evidence = [commit('c1', at(3, 9)), commit('c2', at(3, 12)), commit('c3', at(3, 14))];
    const result = sessionize({ ...base, evidence, lockedBlocks: [locked] });
    expect(result.blocks[0]).toEqual(locked);
    expect(result.blocks.slice(1).every((block) => !block.evidenceIds.includes('c1'))).toBe(true);
  });

});

describe('sessionize — declared entries and confidence', () => {
  it('marks manual entries as declared and never proven', () => {
    const blocks = sessionize({ ...base, evidence: [manual('h1', at(3, 14), at(3, 16))] }).blocks;
    expect(blocks[0]?.provenShare).toBe(0);
    expect(blocks[0]?.confidence).toBe('to-confirm');
    expect(blocks[0]?.note).toBe('declared by the user');
  });

  it('reports unmapped evidence as orphans', () => {
    const orphan = { ...commit('x1', at(3, 10)), clientId: null };
    const result = sessionize({ ...base, evidence: [orphan, commit('c1', at(3, 10))] });
    expect(result.orphanEvidence.map((item) => item.id)).toEqual(['x1']);
  });

  it('grades confidence from the proven share', () => {
    const blocks = sessionize({
      ...base,
      evidence: [commit('c1', at(3, 9)), commit('c2', at(3, 10)), commit('c3', at(3, 11))],
    }).blocks;
    // 09:00-11:00 proven out of a 08:30-11:00 block: 120/150 = 0.8
    expect(blocks[0]?.provenShare).toBeCloseTo(0.8, 5);
    expect(blocks[0]?.confidence).toBe('solid');
  });

  it('is deterministic whatever the order of the evidence', () => {
    const evidence = [commit('c1', at(3, 9)), commit('c2', at(3, 11)), meeting('m1', at(3, 14), at(3, 15), 'northwind')];
    const forward = sessionize({ ...base, evidence });
    const backward = sessionize({ ...base, evidence: [...evidence].reverse() });
    expect(backward.blocks).toEqual(forward.blocks);
    expect(backward.conflicts).toEqual(forward.conflicts);
  });

  it('reports the calibration only after ten corrections', () => {
    const corrections = Array.from({ length: 9 }, (_, index) => ({ blockId: `b${index}`, appliedMinutes: 30, acceptedMinutes: 20 }));
    expect(sessionize({ ...base, evidence: [], corrections }).calibration.suggestedLeadInMinutes).toBeNull();
    const ten = [
      ...Array.from({ length: 5 }, (_, index) => ({ blockId: `a${index}`, appliedMinutes: 30, acceptedMinutes: 20 })),
      ...Array.from({ length: 5 }, (_, index) => ({ blockId: `b${index}`, appliedMinutes: 30, acceptedMinutes: 40 })),
    ];
    expect(sessionize({ ...base, evidence: [], corrections: ten }).calibration.suggestedLeadInMinutes).toBe(30);
  });

  it('keeps NORTHWIND and ACME apart', () => {
    const evidence = [commit('c1', at(3, 9)), commit('n1', at(3, 14), 'northwind', 'northwind-portal')];
    const result = sessionize({ ...base, evidence });
    expect(new Set(result.blocks.map((block) => block.clientId))).toEqual(new Set(['acme', 'northwind']));
    expect(ACME.id).toBe('acme');
    expect(NORTHWIND.id).toBe('northwind');
  });
});

describe('sessionize — pauses, automation et raisons (idées A-01, A-02, P-05)', () => {
  const day = { timeZone: TZ, gapMaxMinutes: 90, breakMaxMinutes: 45, ignoreAutomation: true };

  it('cuts a lunch break without inventing a lead-in after it', () => {
    const settings = resolveSettings(day);
    const evidence = [
      commit('c1', at(3, 9)),
      commit('c2', at(3, 9, 30)),
      commit('c3', at(3, 11)),
      commit('c4', at(3, 11, 30)),
    ];
    const blocks = sessionize({ clients: CLIENTS, settings, evidence }).blocks;
    // 09:30 -> 11:00 is a 90 minute hole: not over gapMax, but over breakMax.
    expect(blocks).toHaveLength(2);
    const resumed = blocks[1];
    expect(resumed?.start).toBe(at(3, 11));
    expect(resumed?.assumedLeadInMinutes).toBe(0);
    expect(resumed?.reason).toEqual({ kind: 'resume', pauseMinutes: 90 });
  });

  it('still assumes a lead-in when the hole is a new session, not a pause', () => {
    const settings = resolveSettings(day);
    const evidence = [commit('c1', at(3, 9)), commit('c2', at(3, 14))];
    const blocks = sessionize({ clients: CLIENTS, settings, evidence }).blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks[1]?.assumedLeadInMinutes).toBe(30);
    // The full 30 minutes were available: nothing shortened them.
    expect(blocks[1]?.reason).toEqual({ kind: 'assumed', minutes: 30, boundedBy: 'none' });
  });

  it('keeps a pause inside the session when it is shorter than breakMax', () => {
    const settings = resolveSettings({ ...day, breakMaxMinutes: 45 });
    const evidence = [commit('c1', at(3, 9)), commit('c2', at(3, 9, 40))];
    expect(sessionize({ clients: CLIENTS, settings, evidence }).blocks).toHaveLength(1);
  });

});

describe('sessionize — automation set aside, listed not hidden', () => {
  const day = { timeZone: TZ, gapMaxMinutes: 90, breakMaxMinutes: 45, ignoreAutomation: true };

  it('sets automation commits aside and lists them', () => {
    const settings = resolveSettings(day);
    const bot: Evidence = {
      id: 'git:acme-api:bot1',
      source: 'git',
      kind: 'commit',
      clientId: 'acme',
      at: at(3, 10),
      repo: 'acme-api',
      authorEmail: 'dependabot[bot]@users.noreply.github.com',
      summary: 'build(deps): bump zod from 3.24.1 to 3.24.2',
    };
    const result = sessionize({
      clients: CLIENTS,
      settings,
      evidence: [commit('c1', at(3, 9)), bot, commit('c2', at(3, 9, 30))],
    });
    expect(result.ignoredEvidence?.map((item) => item.id)).toEqual(['git:acme-api:bot1']);
    expect(result.blocks.flatMap((block) => block.evidenceIds)).not.toContain('git:acme-api:bot1');
  });

});

describe('sessionize — automation opt-out and block reasons', () => {
  const day = { timeZone: TZ, gapMaxMinutes: 90, breakMaxMinutes: 45, ignoreAutomation: true };

  it('counts automation when the user asks for it', () => {
    const settings = resolveSettings({ ...day, ignoreAutomation: false });
    const bot: Evidence = {
      id: 'git:acme-api:bot2',
      source: 'git',
      kind: 'commit',
      clientId: 'acme',
      at: at(3, 9, 15),
      repo: 'acme-api',
      authorEmail: 'mergify[bot]@users.noreply.github.com',
      summary: 'Merge pull request #12 from dependabot/npm/zod',
    };
    const result = sessionize({ clients: CLIENTS, settings, evidence: [commit('c1', at(3, 9)), bot] });
    expect(result.ignoredEvidence).toHaveLength(0);
    expect(result.blocks[0]?.evidenceIds).toContain('git:acme-api:bot2');
  });

  it('explains every kind of block', () => {
    const settings = resolveSettings(day);
    const evidence = [
      checkout('k1', at(3, 8, 50)),
      commit('c1', at(3, 9)),
      commit('c2', at(3, 9, 30)),
      meeting('m1', at(3, 14), at(3, 14, 30)),
      manual('h1', at(3, 16), at(3, 17)),
    ];
    const blocks = sessionize({ clients: CLIENTS, settings, evidence }).blocks;
    const reasons = blocks.map((block) => block.reason?.kind);
    expect(reasons).toContain('checkout');
    expect(reasons).toContain('meeting');
    expect(reasons).toContain('manual');
  });
});
