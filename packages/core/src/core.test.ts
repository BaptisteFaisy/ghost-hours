import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  addDaysInZone,
  dayKeyInZone,
  fnv1a,
  formatClockInZone,
  formatHours,
  formatMinutes,
  formatMoney,
  hashId,
  isSameDayInZone,
  monthOfInZone,
  parseClock,
  parseEvidenceFile,
  resolveSettings,
  serializeEvidenceFile,
  startOfDayInZone,
  weekStartInZone,
  zonedParts,
  zonedTimeToInstant,
} from './index.ts';
import type { Evidence } from './types.ts';

describe('@ghost-hours/core', () => {
  it('computes stable fnv1a and hashId', () => {
    expect(fnv1a('ghost-hours')).toBe(fnv1a('ghost-hours'));
    expect(hashId('ghost-hours')).toMatch(/^[0-9a-z]+$/);
    expect(fnv1a('a')).not.toBe(fnv1a('b'));
  });

  it('formats durations and money cleanly', () => {
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(90)).toBe('1h30');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatHours(104 * 60, 'en')).toBe('104.0 h');
    expect(formatMoney(78_000, 'EUR', 'en')).toContain('780');
  });

  it('parses clocks and handles invalid ones', () => {
    expect(parseClock('07:00')).toBe(7 * 60);
    expect(parseClock('23:45')).toBe(23 * 60 + 45);
    expect(parseClock('25:00')).toBeNull();
    expect(parseClock('not-a-clock')).toBeNull();
  });

  it('clamps invalid settings back to defaults', () => {
    const settings = resolveSettings({
      gapMaxMinutes: -10,
      leadInDefaultMinutes: 0,
      workdayStart: 'invalid',
    });
    expect(settings.gapMaxMinutes).toBe(90);
    expect(settings.leadInDefaultMinutes).toBe(30);
    expect(settings.workdayStart).toBe('07:00');
  });

  it('round-trips zoned parts across standard dates', () => {
    const instant = Date.UTC(2026, 10, 11, 14, 30, 0);
    const parts = zonedParts(instant, 'Europe/Paris');
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(11);
    expect(parts.day).toBe(11);
    expect(parts.hour).toBe(15); // UTC+1 in winter
    expect(parts.minute).toBe(30);
    const back = zonedTimeToInstant(parts, 'Europe/Paris');
    expect(back).toBe(instant);
  });

  it('round-trips evidence files without data loss', () => {
    const now = Date.UTC(2026, 10, 3, 15, 0, 0);
    const item: Evidence = {
      id: 'git:acme:01',
      source: 'git',
      kind: 'commit',
      clientId: null,
      at: now,
      repo: 'acme',
      summary: 'Initial commit',
    };
    const wire = serializeEvidenceFile([item], { collectedAt: now });
    const parsed = parseEvidenceFile(wire);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.evidence).toHaveLength(1);
      expect(parsed.value.evidence[0]?.id).toBe('git:acme:01');
      expect(parsed.value.evidence[0]?.at).toBe(now);
    }
  });

  describe('property tests (fast-check)', () => {
    it('HEU-P-11: adding days in a zone produces monotonic startOfDay', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 28 }),
          fc.integer({ min: 1, max: 10 }),
          (day, add) => {
            const start = zonedTimeToInstant({ year: 2026, month: 11, day }, 'Europe/Paris');
            const next = addDaysInZone(start, add, 'Europe/Paris');
            expect(next).toBeGreaterThan(start);
            expect(isSameDayInZone(start, next, 'Europe/Paris')).toBe(false);
          },
        ),
      );
    });

    it('startOfDayInZone is idempotent', () => {
      fc.assert(
        fc.property(
          fc.integer({
            min: Date.UTC(2026, 0, 1),
            max: Date.UTC(2026, 11, 31),
          }),
          (instant) => {
            const s1 = startOfDayInZone(instant, 'Europe/Paris');
            const s2 = startOfDayInZone(s1, 'Europe/Paris');
            expect(s1).toBe(s2);
          },
        ),
      );
    });

    it('dayKeyInZone is consistent with zonedParts', () => {
      fc.assert(
        fc.property(
          fc.integer({
            min: Date.UTC(2026, 0, 1),
            max: Date.UTC(2026, 11, 31),
          }),
          (instant) => {
            const key = dayKeyInZone(instant, 'Europe/Paris');
            const parts = zonedParts(instant, 'Europe/Paris');
            const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
            expect(key).toBe(`${parts.year}-${pad(parts.month)}-${pad(parts.day)}`);
          },
        ),
      );
    });
  });
});
