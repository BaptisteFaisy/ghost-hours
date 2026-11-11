import { describe, expect, it } from 'vitest';
import { blockId, commitEvidenceId, fnv1a, hashId, ruleId, slugify } from './ids.ts';
import { formatHours, formatMinutes, formatMoney, toCsv } from './format.ts';
import { resolveSettings } from './settings.ts';

describe('deterministic ids', () => {
  it('hashes are stable and distinct', () => {
    expect(fnv1a('ghost-hours')).toBe(fnv1a('ghost-hours'));
    expect(fnv1a('a')).not.toBe(fnv1a('b'));
    expect(hashId('ghost-hours')).toMatch(/^[0-9a-z]+$/);
  });

  it('derived ids ignore nothing that matters', () => {
    expect(commitEvidenceId('acme-api', 'abcdef1234567890')).toBe('git:acme-api:abcdef123456');
    expect(blockId(0, 60_000, 'acme', 'git-session')).toBe(blockId(0, 60_000, 'acme', 'git-session'));
    expect(blockId(0, 60_000, 'acme', 'git-session')).not.toBe(blockId(0, 60_000, 'globex', 'git-session'));
    expect(ruleId('acme', 'repo', 'ACME-API')).toBe(ruleId('acme', 'repo', 'acme-api'));
  });

  it('slugs stay readable', () => {
    expect(slugify('Acme Réseau & Cie')).toBe('acme-reseau-cie');
  });
});

describe('formatting', () => {
  it('renders durations and money', () => {
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(90)).toBe('1h30');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatHours(104 * 60, 'en')).toBe('104.0 h');
    expect(formatMoney(78_000, 'EUR', 'en')).toContain('780');
  });

  it('escapes CSV cells', () => {
    expect(toCsv([['a', 'b,c'], ['d"e', 1]])).toBe('a,"b,c"\n"d""e",1');
  });
});

describe('settings', () => {
  it('clamps absurd values back to defaults', () => {
    const settings = resolveSettings({ gapMaxMinutes: -10, leadInDefaultMinutes: 0, workdayStart: 'x' });
    expect(settings.gapMaxMinutes).toBe(90);
    expect(settings.leadInDefaultMinutes).toBe(30);
    expect(settings.workdayStart).toBe('07:00');
  });
});
