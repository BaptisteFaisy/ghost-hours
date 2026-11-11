import { describe, expect, it } from 'vitest';
import { parseContentLine, unescapeText } from './content-line.ts';
import { unfoldLines } from './unfold.ts';

describe('unfoldLines (RFC 5545 §3.1)', () => {
  it('splits CRLF, LF and lone CR files the same way', () => {
    expect(unfoldLines('A:1\r\nB:2\r\n')).toEqual(['A:1', 'B:2']);
    expect(unfoldLines('A:1\nB:2')).toEqual(['A:1', 'B:2']);
    expect(unfoldLines('A:1\rB:2')).toEqual(['A:1', 'B:2']);
  });

  it('joins a fold introduced by a space', () => {
    const text = 'SUMMARY:Point hebd\r\n o\r\nUID:x@example.org';
    expect(unfoldLines(text)).toEqual(['SUMMARY:Point hebdo', 'UID:x@example.org']);
  });

  it('joins a fold introduced by a tab', () => {
    expect(unfoldLines('SUMMARY:Sprint review\r\n\t(part 2)')).toEqual(['SUMMARY:Sprint review(part 2)']);
  });

  it('keeps inner blank lines and reports the physical line of each entry', () => {
    expect(unfoldLines('A:1\r\n\r\nB:2')).toEqual(['A:1', '', 'B:2']);
  });
});

describe('content lines', () => {
  it('parses name, parameters and value', () => {
    const line = parseContentLine({ text: 'DTSTART;TZID=Europe/Paris;VALUE=DATE-TIME:20261103T140000', line: 7 });
    expect(line?.name).toBe('DTSTART');
    expect(line?.params['TZID']).toEqual(['Europe/Paris']);
    expect(line?.value).toBe('20261103T140000');
    expect(line?.line).toBe(7);
  });

  it('keeps quoted parameters intact', () => {
    const line = parseContentLine({ text: 'ATTENDEE;CN="Osei, Malik";PARTSTAT=ACCEPTED:mailto:malik@example.org', line: 1 });
    expect(line?.params['CN']).toEqual(['Osei, Malik']);
    expect(line?.params['PARTSTAT']).toEqual(['ACCEPTED']);
    expect(line?.value).toBe('mailto:malik@example.org');
  });

  it('rejects a line without a colon', () => {
    expect(parseContentLine({ text: 'SUMMARY Point hebdo', line: 1 })).toBeNull();
  });
});

describe('text escaping (RFC 5545 §3.3.11)', () => {
  it('unescapes the four defined sequences', () => {
    expect(unescapeText('a\\, b\\; c\\nd\\\\e')).toBe('a, b; c\nd\\e');
  });

  it('keeps an unknown escape as written', () => {
    expect(unescapeText('caf\\u00e9')).toBe('caf\\u00e9');
  });
});
