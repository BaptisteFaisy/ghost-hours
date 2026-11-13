// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { reasonText } from './ReasonLine.tsx';
import { en } from '../i18n/en.ts';
import type { BlockReason } from '@ghost-hours/core';
import type { I18nApi } from '../i18n/index.ts';

/** A translation shim over the real English dictionary: no DOM needed. */
const t = ((key: string, values?: Readonly<Record<string, string | number>>): string => {
  const template = (en as Readonly<Record<string, string>>)[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(values?.[name] ?? ''));
}) as I18nApi['t'];

const nameOf = (clientId: string): string => (clientId === 'acme' ? 'Acme' : clientId);

describe('reasonText — every kind of bound has a sentence (idea P-05)', () => {
  const cases: readonly [BlockReason, RegExp][] = [
    [{ kind: 'checkout', repo: 'acme-api', minutes: 12 }, /branch switch in acme-api, 12 min/],
    [{ kind: 'assumed', minutes: 30, boundedBy: 'none' }, /30 min lead-in.*Nothing shortened/s],
    [{ kind: 'assumed', minutes: 10, boundedBy: 'previous-proof' }, /previous proof of another client/],
    [{ kind: 'assumed', minutes: 5, boundedBy: 'workday-start' }, /workday start/],
    [{ kind: 'resume', pauseMinutes: 75 }, /75 min pause: nothing is assumed/],
    [{ kind: 'meeting' }, /Exact bounds of the calendar entry/],
    [{ kind: 'manual' }, /Declared by you, not proven/],
    [{ kind: 'merged', count: 2 }, /Merged with 2 blocks/],
    [{ kind: 'trimmed', byClient: 'acme' }, /Trimmed by a meeting of Acme/],
    [{ kind: 'conflict', withClient: 'acme' }, /In conflict with Acme/],
  ];

  for (const [reason, expected] of cases) {
    it(`says something true for "${reason.kind}"`, () => {
      expect(reasonText(reason, t, nameOf)).toMatch(expected);
    });
  }

  it('uses the client name, never the raw id', () => {
    expect(reasonText({ kind: 'trimmed', byClient: 'acme' }, t, nameOf)).toContain('Acme');
    expect(reasonText({ kind: 'trimmed', byClient: 'acme' }, t, nameOf)).not.toContain('byClient');
  });
});
