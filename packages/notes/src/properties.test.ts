import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { parseNotes } from './index.ts';
import type { NoteFile } from './index.ts';

const OPTIONS = { defaultTimeZone: 'Europe/Paris' } as const;

const shape = fc.constantFrom(
  '- 14:02 Export #client:acme',
  '* 09:00 — Standup @northwind',
  '[11:30] Review client: Globex',
  '16h45 Wrote the ledger',
  '2026-11-03T08:15 Kickoff',
  'plain prose without a clock',
  '```',
);

const fileArb: fc.Arbitrary<NoteFile> = fc.record({
  path: fc.constantFrom('2026-11-03.md', 'notes/2026/11/04.md', 'todo.md', 'journal-2026-11-05.md'),
  content: fc.array(shape, { minLength: 0, maxLength: 6 }).map((lines) => lines.join('\n')),
});

describe('parseNotes — properties', () => {
  it('HEU-F-16: the same files always give the same report', () => {
    fc.assert(
      fc.property(fc.array(fileArb, { maxLength: 4 }), (files) => {
        expect(parseNotes(files, OPTIONS)).toEqual(parseNotes(files, OPTIONS));
      }),
    );
  });

  it('HEU-P-03: the report does not depend on the order of the files', () => {
    fc.assert(
      fc.property(fc.array(fileArb, { maxLength: 4 }), (files) => {
        expect(parseNotes([...files].reverse(), OPTIONS)).toEqual(parseNotes(files, OPTIONS));
      }),
    );
  });

  it('every note evidence carries an instant, a source and a stable id', () => {
    fc.assert(
      fc.property(fc.array(fileArb, { maxLength: 4 }), (files) => {
        for (const item of parseNotes(files, OPTIONS).evidence) {
          expect(item.source).toBe('note');
          expect(item.kind).toBe('note');
          expect(typeof item.at).toBe('number');
          expect(item.id).toBe(`note:${item.file}:${item.line}:${item.at}`);
        }
      }),
    );
  });

  it('the output is sorted by instant, file and line', () => {
    fc.assert(
      fc.property(fc.array(fileArb, { maxLength: 4 }), (files) => {
        const keys = parseNotes(files, OPTIONS).evidence.map((item) => [item.at ?? 0, item.file ?? '', item.line ?? 0]);
        for (let i = 1; i < keys.length; i += 1) {
          const previous = keys[i - 1] ?? [0, '', 0];
          const current = keys[i] ?? [0, '', 0];
          expect(compareTuple(previous, current)).toBeLessThanOrEqual(0);
        }
      }),
    );
  });
});

function compareTuple(a: readonly (number | string)[], b: readonly (number | string)[]): number {
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left < right) return -1;
    if (left > right) return 1;
  }
  return 0;
}
