import { describe, expect, it } from 'vitest';
import { noteEvidenceId, zonedTimeToInstant } from '@ghost-hours/core';
import { parseNotes } from './index.ts';
import type { NoteFile, NoteParseOptions } from './index.ts';

const OPTIONS: NoteParseOptions = { defaultTimeZone: 'Europe/Paris' };

function file(path: string, content: string): NoteFile {
  return { path, content };
}

function atParis(day: number, hour: number, minute: number, second = 0): number {
  return zonedTimeToInstant({ year: 2026, month: 11, day, hour, minute, second }, 'Europe/Paris');
}

const DAY_3 = '2026-11-03.md';

describe('parseNotes — line timestamps', () => {
  it('reads every documented line shape', () => {
    const shapes = [
      '- 14:02 Fixed the CSV export',
      '* 14:02 — Fixed the CSV export',
      '[14:02] Fixed the CSV export',
      '14h02 Fixed the CSV export',
      '2026-11-03T14:02 Fixed the CSV export',
    ];
    for (const line of shapes) {
      const report = parseNotes([file(DAY_3, line)], OPTIONS);
      expect(report.skipped).toEqual([]);
      expect(report.evidence).toHaveLength(1);
      expect(report.evidence[0]?.at).toBe(atParis(3, 14, 2));
    }
  });

  it('keeps seconds when the line states them', () => {
    const report = parseNotes([file(DAY_3, '- 14:02:33 Pushed the fix')], OPTIONS);
    expect(report.evidence[0]?.at).toBe(atParis(3, 14, 2, 33));
  });

  it('treats an explicit offset as absolute', () => {
    const report = parseNotes([file('todo.md', '2026-11-03T14:02:00Z Deployed')], OPTIONS);
    expect(report.evidence[0]?.at).toBe(Date.UTC(2026, 10, 3, 14, 2, 0));
  });

  it('resolves a month/day-only path with the year option', () => {
    const report = parseNotes([file('notes/11/03.md', '- 14:02 Export')], { ...OPTIONS, year: 2026 });
    expect(report.evidence[0]?.at).toBe(atParis(3, 14, 2));
  });
});

describe('parseNotes — day resolution', () => {
  it('inherits the day of the file for a line without a date', () => {
    const report = parseNotes([file('notes/2026/11/05.md', '- 09:15 Standup with Acme')], OPTIONS);
    expect(report.evidence[0]?.at).toBe(atParis(5, 9, 15));
  });

  it('prefers the date written on the line over the file day', () => {
    const report = parseNotes([file(DAY_3, '2026-11-04T10:00 Follow-up call')], OPTIONS);
    expect(report.evidence[0]?.at).toBe(atParis(4, 10, 0));
  });

  it('skips a timestamped line with neither a line date nor a dated file', () => {
    const report = parseNotes([file('todo.md', '- 14:02 Fix the export')], OPTIONS);
    expect(report.evidence).toEqual([]);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0]?.path).toBe('todo.md');
    expect(report.skipped[0]?.line).toBe(1);
    expect(report.skipped[0]?.reason).toContain('timestamp without a date');
  });

  it('reports an impossible clock instead of guessing', () => {
    const report = parseNotes([file(DAY_3, '- 25:99 Fix the export')], OPTIONS);
    expect(report.evidence).toEqual([]);
    expect(report.skipped[0]?.reason).toContain('not a clock');
  });

  it('ignores a clock buried inside a sentence', () => {
    const report = parseNotes([file(DAY_3, 'Call at 14:02 with Acme was moved')], OPTIONS);
    expect(report.evidence).toEqual([]);
  });
});

describe('parseNotes — dated files', () => {
  it('recognizes the four documented file shapes', () => {
    const paths = [DAY_3, '2026-11-03-acme.md', 'notes/2026/11/03.md', 'journal-2026-11-03.md'];
    for (const path of paths) {
      const report = parseNotes([file(path, '- 08:30 Started early')], OPTIONS);
      expect(report.evidence).toHaveLength(1);
      expect(report.evidence[0]?.file).toBe(path);
      expect(report.evidence[0]?.at).toBe(atParis(3, 8, 30));
    }
  });

  it('reports an empty file', () => {
    const report = parseNotes([file(DAY_3, '')], OPTIONS);
    expect(report.evidence).toEqual([]);
    expect(report.skipped).toEqual([{ path: DAY_3, reason: 'empty file' }]);
  });

  it('reports a file with no timestamped line', () => {
    const report = parseNotes([file('2026-11-06.md', '# Journal\n\nNothing happened.\n')], OPTIONS);
    expect(report.evidence).toEqual([]);
    expect(report.skipped).toEqual([{ path: '2026-11-06.md', reason: 'no timestamped line found' }]);
  });

  it('skips every line inside a fenced code block', () => {
    const content = [
      '# Journal',
      '',
      '```sh',
      '- 14:02 npm run export',
      '```',
      '',
      '- 16:40 Wrote the export by hand',
    ].join('\n');
    const report = parseNotes([file(DAY_3, content)], OPTIONS);
    expect(report.evidence).toHaveLength(1);
    expect(report.evidence[0]?.at).toBe(atParis(3, 16, 40));
    expect(report.evidence[0]?.line).toBe(7);
  });

  it('handles tilde fences and CRLF line endings', () => {
    const content = ['~~~', '- 14:02 in code', '~~~', '- 15:00 real work'].join('\r\n');
    const report = parseNotes([file(DAY_3, content)], OPTIONS);
    expect(report.evidence).toHaveLength(1);
    expect(report.evidence[0]?.at).toBe(atParis(3, 15, 0));
  });
});

describe('parseNotes — evidence shape', () => {
  it('builds a note evidence with a stable id, the text, the tag and the raw line', () => {
    const line = '- 14:02 Exported the ledger #client:acme @globex';
    const report = parseNotes([file(DAY_3, line)], OPTIONS);
    const evidence = report.evidence[0];
    expect(evidence?.id).toBe(noteEvidenceId(DAY_3, 1, atParis(3, 14, 2)));
    expect(evidence?.source).toBe('note');
    expect(evidence?.kind).toBe('note');
    expect(evidence?.clientId).toBeNull();
    expect(evidence?.text).toBe('Exported the ledger');
    expect(evidence?.tag).toBe('acme');
    expect(evidence?.raw).toEqual({ rawLine: line, tags: ['acme', 'globex'] });
  });

  it('reads a tag written in the keyword form', () => {
    const report = parseNotes([file(DAY_3, '* 11:00 Weekly review client: Northwind')], OPTIONS);
    expect(report.evidence[0]?.tag).toBe('northwind');
    expect(report.evidence[0]?.text).toBe('Weekly review');
  });

  it('leaves the tag undefined when the line carries none', () => {
    const report = parseNotes([file(DAY_3, '- 14:02 Read the RFC')], OPTIONS);
    expect(report.evidence[0]?.tag).toBeUndefined();
    expect(report.evidence[0]?.text).toBe('Read the RFC');
  });

  it('sorts the output by instant, then file, then line', () => {
    const files = [
      file('2026-11-04.md', '- 09:00 Late day\n- 08:00 Same day'),
      file('2026-11-03.md', '- 17:00 First day'),
    ];
    const report = parseNotes(files, OPTIONS);
    expect(report.evidence.map((item) => [item.file, item.line])).toEqual([
      ['2026-11-03.md', 1],
      ['2026-11-04.md', 2],
      ['2026-11-04.md', 1],
    ]);
  });

  it('produces the same report whatever the file order', () => {
    const files = [
      file('2026-11-04.md', '- 09:00 Late day'),
      file('2026-11-03.md', '- 17:00 First day'),
      file('todo.md', '- 12:00 Undated'),
    ];
    expect(parseNotes([...files].reverse(), OPTIONS)).toEqual(parseNotes(files, OPTIONS));
  });
});
