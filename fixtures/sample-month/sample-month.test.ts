// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseEvidenceFile } from '@ghost-hours/core';
import { applyRules } from '@ghost-hours/mapping';
import { parseNotes } from '@ghost-hours/notes';
import { expandRecurring, parseIcs, toEvidence } from '@ghost-hours/ics';
import { monthRangeInZone } from '@ghost-hours/core';
import { sessionize } from '@ghost-hours/sessionizer';
import { loadSampleMonth } from './index.ts';
import rawEvidence from './evidence.json';

/**
 * Acceptance test of the demo month (D.17): the numbers shown in the video are
 * computed here by the real pipeline, so they cannot drift from the product.
 */
const sample = loadSampleMonth();
const period = monthRangeInZone(sample.expected.period.year, sample.expected.period.month, sample.settings.timeZone);

function reconstruct() {
  const calendar = parseIcs(sample.calendarIcs, { defaultTimeZone: sample.settings.timeZone });
  expect(calendar.ok).toBe(true);
  if (!calendar.ok) throw new Error(calendar.errors.join('; '));
  const meetings = toEvidence(
    expandRecurring(calendar.value.events, period, { defaultTimeZone: sample.settings.timeZone }),
  );
  const notes = parseNotes([...sample.notes], { defaultTimeZone: sample.settings.timeZone });
  const raw = [...sample.evidence, ...meetings, ...notes.evidence];
  const mapped = applyRules(raw, sample.clients);
  expect(mapped.orphans).toHaveLength(0);
  return sessionize({
    evidence: mapped.mapped,
    clients: sample.clients,
    settings: sample.settings,
  });
}

describe('the sample month (spec D.17)', () => {
  it('is a valid evidence file', () => {
    expect(parseEvidenceFile(JSON.parse(JSON.stringify(rawEvidence))).ok).toBe(true);
  });

  it('reads the calendar without skipping anything silently', () => {
    const calendar = parseIcs(sample.calendarIcs, { defaultTimeZone: sample.settings.timeZone });
    expect(calendar.ok).toBe(true);
    if (!calendar.ok) return;
    // The cancelled, the transparent and the all-day events are dropped by
    // `toEvidence`, and the reader says so instead of hiding it.
    expect(calendar.value.events.length).toBeGreaterThan(0);
    expect(calendar.value.skipped).toHaveLength(0);
  });

  it('maps every piece of evidence to a client', () => {
    const calendar = parseIcs(sample.calendarIcs, { defaultTimeZone: sample.settings.timeZone });
    if (!calendar.ok) throw new Error(calendar.errors.join('; '));
    const meetings = toEvidence(
      expandRecurring(calendar.value.events, period, { defaultTimeZone: sample.settings.timeZone }),
    );
    const notes = parseNotes([...sample.notes], { defaultTimeZone: sample.settings.timeZone });
    const mapped = applyRules([...sample.evidence, ...meetings, ...notes.evidence], sample.clients);
    expect(mapped.orphans).toHaveLength(0);
  });

  it('reconstructs exactly the announced hours', () => {
    const result = reconstruct();
    const counted = result.blocks.filter((block) => block.status !== 'conflict' && block.status !== 'rejected');
    const total = counted.reduce((sum, block) => sum + (block.end - block.start) / 60_000, 0);
    expect(Math.round(total)).toBe(sample.expected.foundMinutes);
    for (const [clientId, expected] of Object.entries(sample.expected.perClient)) {
      const own = counted
        .filter((block) => block.clientId === clientId)
        .reduce((sum, block) => sum + (block.end - block.start) / 60_000, 0);
      expect(Math.round(own)).toBe(expected.foundMinutes);
    }
  });

  it('shows the ghost hours and their amount', () => {
    const declared = Object.values(sample.declaredMinutes).reduce((sum, minutes) => sum + minutes, 0);
    expect(sample.expected.foundMinutes - declared).toBe(sample.expected.ghostMinutes);
    expect(sample.expected.ghostMinutes).toBe(720);
    expect(sample.expected.ghostAmountCents).toBe(78_000);
    expect(declared).toBe(sample.expected.declaredMinutes);
  });

  it('contains a contradiction and a block that is not proven', () => {
    const result = reconstruct();
    expect(result.blocks.filter((block) => block.status === 'conflict')).toHaveLength(sample.expected.conflictCount);
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.blocks.filter((block) => block.confidence !== 'solid').length).toBe(sample.expected.unprovenBlocks);
  });

  it('never overlaps two blocks the user could confirm', () => {
    const result = reconstruct();
    const blocks = result.blocks.filter((block) => block.status !== 'conflict').sort((a, b) => a.start - b.start);
    for (let i = 1; i < blocks.length; i += 1) {
      expect(blocks[i]?.start).toBeGreaterThanOrEqual(blocks[i - 1]?.end ?? 0);
    }
  });
});
