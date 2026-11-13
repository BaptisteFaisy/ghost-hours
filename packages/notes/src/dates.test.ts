import { describe, expect, it } from 'vitest';
import { dayKeyFromPath } from './index.ts';

describe('dayKeyFromPath', () => {
  it('reads the four documented dated-file shapes', () => {
    expect(dayKeyFromPath('2026-11-03.md')).toBe('2026-11-03');
    expect(dayKeyFromPath('2026-11-03-acme.md')).toBe('2026-11-03');
    expect(dayKeyFromPath('notes/2026/11/03.md')).toBe('2026-11-03');
    expect(dayKeyFromPath('journal-2026-11-03.md')).toBe('2026-11-03');
  });

  it('reads a date spread over the directories, with or without a suffix', () => {
    expect(dayKeyFromPath('notes/2026/11/03-acme.md')).toBe('2026-11-03');
    expect(dayKeyFromPath('/home/sofia/notes/2026/01/09.md')).toBe('2026-01-09');
    expect(dayKeyFromPath('2026-11-03/acme.md')).toBe('2026-11-03');
  });

  it('accepts a single-digit month or day and pads the result', () => {
    expect(dayKeyFromPath('2026-1-3.md')).toBe('2026-01-03');
    expect(dayKeyFromPath('notes/2026/1/3.md')).toBe('2026-01-03');
  });

  it('accepts Windows separators', () => {
    expect(dayKeyFromPath('notes\\2026\\11\\03.md')).toBe('2026-11-03');
  });

  it('returns null when the path carries no usable date', () => {
    expect(dayKeyFromPath('todo.md')).toBeNull();
    expect(dayKeyFromPath('notes/acme.md')).toBeNull();
    expect(dayKeyFromPath('2026-13-03.md')).toBeNull();
    expect(dayKeyFromPath('2026-02-30.md')).toBeNull();
    expect(dayKeyFromPath('acme-api-2026.md')).toBeNull();
  });

  it('does not mistake a longer number for a date', () => {
    expect(dayKeyFromPath('12026-11-034.md')).toBeNull();
  });
});
