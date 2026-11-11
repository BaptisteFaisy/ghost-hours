import { describe, expect, it } from 'vitest';
import { ACME, ACME_EVIDENCE, ACME_MONTH_BLOCKS, SETTINGS, makeBlock } from './fixtures.ts';
import { annexToCsv, buildAnnex } from './index.ts';

describe('buildAnnex (HEU-F-26)', () => {
  it('gives one row per day, durations only at the sober level', () => {
    const annex = buildAnnex(ACME_MONTH_BLOCKS, ACME_EVIDENCE, SETTINGS, 'durations', 'en');
    expect(annex).toHaveLength(10);
    expect(annex[0]).toEqual({ dayKey: '2026-11-02', minutes: 420, commitCount: 0, meetingTitles: [] });
    expect(annex.reduce((sum, day) => sum + day.minutes, 0)).toBe(3_960);
  });

  it('adds commit counts and meeting titles at the detailed level', () => {
    const annex = buildAnnex(ACME_MONTH_BLOCKS, ACME_EVIDENCE, SETTINGS, 'with-evidence', 'en');
    expect(annex[0]?.commitCount).toBe(2);
    expect(annex[0]?.meetingTitles).toEqual(['Weekly "sync", Acme']);
    expect(annex[1]?.commitCount).toBe(1);
    expect(annex[1]?.meetingTitles).toEqual([]);
    expect(annex[2]?.commitCount).toBe(0);
  });

  it('never mentions a block that is not billable', () => {
    const blocks = [
      makeBlock({ id: 'annex-ghost', dayKey: '2026-11-02', clock: '09:00', minutes: 420, clientId: ACME.id, status: 'proposed', evidenceIds: ['git:acme-api:c1'] }),
    ];
    expect(buildAnnex(blocks, ACME_EVIDENCE, SETTINGS, 'with-evidence', 'en')).toEqual([]);
  });

  it('ignores evidence ids it does not know', () => {
    const blocks = [makeBlock({ id: 'orphan', dayKey: '2026-11-02', clock: '09:00', minutes: 60, clientId: ACME.id, evidenceIds: ['git:missing'] })];
    const annex = buildAnnex(blocks, ACME_EVIDENCE, SETTINGS, 'with-evidence', 'en');
    expect(annex[0]?.commitCount).toBe(0);
  });
});

describe('annexToCsv (HEU-F-27)', () => {
  it('writes a header, a row per day and a total row', () => {
    const annex = buildAnnex(ACME_MONTH_BLOCKS, ACME_EVIDENCE, SETTINGS, 'with-evidence', 'en');
    const csv = annexToCsv(annex, 'en');
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Day,Minutes,Hours,Commits,Meetings');
    expect(lines).toHaveLength(12);
    expect(lines[11]).toBe('Total,3960,66.0 h,3,');
  });

  it('escapes quotes and separators coming from meeting titles', () => {
    const annex = buildAnnex(ACME_MONTH_BLOCKS, ACME_EVIDENCE, SETTINGS, 'with-evidence', 'en');
    const csv = annexToCsv(annex, 'en');
    expect(csv).toContain('"Weekly ""sync"", Acme"');
  });

  it('speaks French', () => {
    const annex = buildAnnex(ACME_MONTH_BLOCKS, ACME_EVIDENCE, SETTINGS, 'durations', 'fr');
    expect(annexToCsv(annex, 'fr').split('\n')[0]).toBe('Jour,Minutes,Heures,Commits,Réunions');
  });
});
