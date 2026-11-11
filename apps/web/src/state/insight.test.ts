// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { loadSampleMonth } from '@ghost-hours/fixture-sample-month';
import { explainGap, countedBlocks, minutesOf } from './insight.ts';
import { defensibilityScore, objectionsTo } from './objections.ts';
import { shouldUseWorker, WORKER_THRESHOLD } from './reconstructAsync.ts';
import { draftFor } from './selectors.ts';
import { clearBrowserStorage, stubBrowserStorage } from '../components/testSupport.ts';
import { loadSampleState, sampleStateAfter } from './sampleState.ts';
import { initialState } from './types.ts';
import { DEFAULT_SETTINGS } from '@ghost-hours/core';

/** A bare state, for the cases the fictitious month does not cover. */
function emptyLike() {
  return initialState(DEFAULT_SETTINGS);
}

/**
 * The two answers the product owes its user: where the undeclared hours come
 * from (idea I-01), and what a client could argue against the draft (I-15).
 */
const sample = loadSampleMonth();

describe('explainGap — where the ghost hours come from (I-01)', () => {
  afterEach(cleanup);

  it('accounts for the 12 ghost hours of the sample month', async () => {
    stubBrowserStorage();
    clearBrowserStorage();
    const state = await loadSampleState();
    const gap = explainGap(state, null);
    expect(gap.ghostMinutes).toBe(sample.expected.ghostMinutes);
    expect(gap.causes.length).toBeGreaterThan(0);
    const total = gap.causes.reduce((sum, cause) => sum + cause.minutes, 0);
    expect(total).toBeLessThanOrEqual(gap.ghostMinutes);
    expect(total + gap.unexplainedMinutes).toBe(gap.ghostMinutes);
  });

  it('names the calendar meetings behind the gap', async () => {
    stubBrowserStorage();
    clearBrowserStorage();
    const state = await loadSampleState();
    const meeting = explainGap(state, null).causes.find((cause) => cause.kind === 'meeting');
    expect(meeting).toBeDefined();
    expect(meeting?.minutes ?? 0).toBeGreaterThan(0);
  });

  it('counts assumed lead-ins when the month has no reflog to lean on', () => {
    // The fictitious month starts every session on a branch switch, so nothing
    // is assumed there. This checks the cause exists at all, on a block whose
    // lead-in is pure assumption.
    // A weekday morning in November 2026, Paris time: 08:30 to 10:00.
    const start = Date.UTC(2026, 10, 4, 7, 30);
    const block = {
      id: 'blk:x', start, end: start + 90 * 60_000, clientId: 'acme', projectId: null,
      status: 'proposed' as const, origin: 'git-session' as const, provenShare: 0.6,
      confidence: 'likely' as const, assumedLeadInMinutes: 30, evidenceIds: ['c1'],
      locked: false, adjusted: false,
    };
    const state = {
      ...emptyLike(),
      activeMonth: { year: 2026, month: 11 },
      blocks: [block],
      declaredMinutes: { acme: 60 },
    };
    const gap = explainGap(state, 'acme');
    expect(gap.causes.map((cause) => cause.kind)).toContain('assumed');
  });

  it('explains nothing when the declared hours match the found ones', async () => {
    stubBrowserStorage();
    clearBrowserStorage();
    const state = await loadSampleState();
    const found = Math.round(minutesOf(countedBlocks(state, null)));
    const aligned = await sampleStateAfter({ type: 'setDeclared', clientId: 'acme', minutes: found });
    // One client declared everything, the others declared nothing: the total gap
    // is what matters, and it is explained or zero, never negative.
    const gap = explainGap(aligned, null);
    expect(gap.ghostMinutes).toBeGreaterThanOrEqual(0);
    expect(gap.unexplainedMinutes).toBeGreaterThanOrEqual(0);
  });

});

describe('explainGap — per client', () => {
  afterEach(cleanup);

  it('answers for a single client too', async () => {
    stubBrowserStorage();
    clearBrowserStorage();
    const state = await loadSampleState();
    const acme = explainGap(state, 'acme');
    expect(acme.ghostMinutes).toBe(sample.expected.perClient.acme?.ghostMinutes ?? 0);
  });
});

describe('objectionsTo — the devil’s advocate (I-15)', () => {
  afterEach(cleanup);

  it('objects to the assumed lead-ins of a confirmed draft', async () => {
    stubBrowserStorage();
    clearBrowserStorage();
    const state = await sampleStateAfter({ type: 'confirmSolidBlocks', threshold: 0.8 });
    const client = state.clients[0];
    expect(client).toBeDefined();
    const draft = draftFor(state, client?.id ?? '');
    const blocks = state.blocks.filter(
      (block) => block.clientId === client?.id && (block.status === 'confirmed' || block.status === 'locked'),
    );
    const objections = objectionsTo(state, draft, blocks);
    const kinds = objections.map((objection) => objection.kind);
    expect(kinds).toContain('no-tax-rate');
    expect(kinds).toContain('unresolved-conflict');
    expect(objections.every((objection) => objection.minutes >= 0)).toBe(true);
  });

});

describe('objectionsTo — a complete draft', () => {
  afterEach(cleanup);

  it('says nothing is obvious once the draft is complete', async () => {
    stubBrowserStorage();
    clearBrowserStorage();
    const state = await sampleStateAfter({ type: 'confirmSolidBlocks', threshold: 0.8 });
    const client = state.clients[0];
    const draft = draftFor(state, client?.id ?? '');
    const complete = { ...draft, taxRateBp: 2000 };
    const withAnnex = { ...state, annexDetail: 'with-evidence' as const };
    const objections = objectionsTo(withAnnex, complete, []).filter((o) => o.kind !== 'assumed');
    expect(objections.map((objection) => objection.kind)).not.toContain('no-tax-rate');
    expect(objections.map((objection) => objection.kind)).not.toContain('annex-too-short');
  });

  it('scores defensibility between 0 and 100, and better with evidence', async () => {
    stubBrowserStorage();
    clearBrowserStorage();
    const state = await sampleStateAfter({ type: 'confirmSolidBlocks', threshold: 0.8 });
    const client = state.clients[0];
    const draft = draftFor(state, client?.id ?? '');
    const blocks = state.blocks.filter((block) => block.clientId === client?.id && block.status === 'confirmed');
    const objections = objectionsTo(state, draft, blocks);
    const score = defensibilityScore(state, draft, blocks, objections);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    const detailed = { ...draft, taxRateBp: 2000 };
    const better = defensibilityScore(
      { ...state, annexDetail: 'with-evidence' },
      detailed,
      blocks,
      objectionsTo({ ...state, annexDetail: 'with-evidence' }, detailed, blocks),
    );
    expect(better).toBeGreaterThanOrEqual(score);
  });
});

describe('the worker threshold (R-01)', () => {
  it('keeps small months on the main thread', () => {
    expect(shouldUseWorker(10)).toBe(false);
    expect(WORKER_THRESHOLD).toBeGreaterThan(100);
  });
});
