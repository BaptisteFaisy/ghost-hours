import { describe, expect, it } from 'vitest';
import { resolveSettings } from '@ghost-hours/core';
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
      commit('c1', at(3, 9)),
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

describe('sessionize — prudence, locks, orphans (D.5 step 9, HEU-F-29)', () => {
  it('drops a session shorter than minSession and lists its proofs', () => {
    const tight = resolveSettings({ timeZone: TZ, leadInDefaultMinutes: 1, minSessionMinutes: 15 });
    const result = sessionize({ clients: CLIENTS, settings: tight, evidence: [commit('c1', at(3, 10)), commit('c2', at(3, 10, 5))] });
    expect(result.blocks).toHaveLength(0);
    expect(result.orphanEvidence.map((item) => item.id)).toEqual(['c1', 'c2']);
  });

  it('keeps locked blocks untouched and out of the computation', () => {
    const locked = lockedBlock(at(3, 9), at(3, 12), 'acme', ['c1', 'c2']);
    const evidence = [commit('c1', at(3, 9)), commit('c2', at(3, 12)), commit('c3', at(3, 14))];
    const result = sessionize({ ...base, evidence, lockedBlocks: [locked] });
    expect(result.blocks[0]).toEqual(locked);
    expect(result.blocks.slice(1).every((block) => !block.evidenceIds.includes('c1'))).toBe(true);
  });

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
