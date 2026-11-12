// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { monthRangeInZone, parseEvidenceFile } from '@ghost-hours/core';
import type { Block } from '@ghost-hours/core';
import { applyRules } from '@ghost-hours/mapping';
import { sessionize } from '@ghost-hours/sessionizer';
import { loadRealMonth } from './index.ts';
import rawEvidence from './evidence.json';

/**
 * The acceptance test of the real month: the figures the demo shows are
 * recomputed here by the real pipeline (mapping rules, sessionizer), so they
 * cannot drift from the product. The second half of the file guards the other
 * promise of this fixture — that it is genuinely anonymized.
 */

const real = loadRealMonth();
const expected = real.expected;
const period = monthRangeInZone(expected.period.year, expected.period.month, expected.timeZone);

function reconstruct() {
  const mapped = applyRules([...real.evidence], real.clients);
  const result = sessionize({
    evidence: mapped.mapped,
    clients: real.clients,
    settings: real.settings,
  });
  const inside = result.blocks.filter((block) => block.start < period.end && block.end > period.start);
  const counted = inside.filter((block) => block.status !== 'conflict' && block.status !== 'rejected');
  return { orphans: mapped.orphans, ignored: result.ignoredEvidence ?? [], conflicts: result.conflicts, counted };
}

const minutesOf = (blocks: readonly Block[]): number =>
  blocks.reduce((sum, block) => sum + Math.round((block.end - block.start) / 60_000), 0);

const dayKeyOf = (instant: number): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: expected.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);

describe('the real month (October 2026)', () => {
  const run = reconstruct();

  it('is a valid evidence file, and every proof belongs to a client', () => {
    expect(parseEvidenceFile(JSON.parse(JSON.stringify(rawEvidence))).ok).toBe(true);
    expect(real.evidence.length).toBe(expected.evidenceCount);
    expect(run.orphans).toHaveLength(expected.orphanCount);
    expect(run.ignored).toHaveLength(expected.ignoredAutomation);
  });

  it('finds the hours, the blocks and the contradictions announced', () => {
    expect(minutesOf(run.counted)).toBe(expected.foundMinutes);
    expect(run.counted).toHaveLength(expected.blockCount);
    expect(run.conflicts).toHaveLength(expected.conflictCount);
    expect(run.counted.filter((block) => block.provenShare < 0.5)).toHaveLength(expected.unprovenBlocks);
    expect(run.counted.filter((block) => block.provenShare >= 0.8)).toHaveLength(expected.solidBlocks);
  });

  it('spreads over the announced days, with the announced assumed lead-ins', () => {
    const days = new Set(run.counted.map((block) => dayKeyOf(block.start)));
    expect(days.size).toBe(expected.activeDays);
    expect(run.counted.reduce((sum, block) => sum + block.assumedLeadInMinutes, 0)).toBe(
      expected.assumedLeadInMinutes,
    );
  });

  it('breaks down per project as announced', () => {
    for (const [clientId, perClient] of Object.entries(expected.perClient)) {
      const own = run.counted.filter((block) => block.clientId === clientId);
      expect(minutesOf(own), clientId).toBe(perClient.foundMinutes);
      expect(own, clientId).toHaveLength(perClient.blockCount);
    }
  });

  it('declares nothing: the gap is for the reader to fill in', () => {
    expect(expected.declaredMinutes).toBeNull();
    expect(expected.ghostMinutes).toBeNull();
    expect(real.declaredMinutes).toEqual({});
  });
});

describe('the real month is anonymized', () => {
  const items = rawEvidence.items as readonly Record<string, unknown>[];

  it('carries no commit message at all', () => {
    expect(items.filter((item) => item.summary !== undefined)).toHaveLength(0);
  });

  it('names every repository, remote, branch and author with a pseudonym', () => {
    for (const item of items) {
      if (item.repo !== undefined) expect(String(item.repo)).toMatch(/^projet-\d+$/);
      if (item.remote !== undefined) expect(String(item.remote)).toMatch(/@example\.invalid:/);
      if (item.authorEmail !== undefined) expect(item.authorEmail).toBe('dev@example.invalid');
      for (const field of ['branch', 'to', 'from'] as const) {
        if (item[field] !== undefined) expect(String(item[field])).toMatch(/^branche-\d+$/);
      }
    }
  });

  it('keeps no local path and no identity in the collected repositories', () => {
    const repos = (rawEvidence.repos ?? []) as readonly Record<string, unknown>[];
    expect(repos.length).toBeGreaterThan(0);
    for (const repo of repos) {
      expect(String(repo.path)).toMatch(/^\/local\/projet-\d+$/);
      expect(String(repo.name)).toMatch(/^projet-\d+$/);
      expect(String(repo.remote)).toMatch(/@example\.invalid:/);
    }
  });

  it('keeps what makes the month real: the instants and the volumes', () => {
    // 977 proofs, and not one of them moved: the earliest and the latest instant
    // are the real ones, so the rhythm the sessionizer reads is genuine.
    const instants = items.map((item) => Date.parse(String(item.at))).filter((value) => !Number.isNaN(value));
    expect(instants.length).toBe(expected.evidenceCount);
    expect(Math.min(...instants)).toBeLessThan(Math.max(...instants));
    expect(new Date(Math.min(...instants)).getUTCFullYear()).toBe(2026);
  });
});
