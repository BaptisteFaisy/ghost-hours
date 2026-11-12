import type { Client, Evidence, ReconstructionSettings, SupportedLocale } from '@ghost-hours/core';
import { DEFAULT_SETTINGS, parseEvidenceFile, ruleId, unwrap } from '@ghost-hours/core';
import type { NoteFile } from '@ghost-hours/notes';
import evidenceFile from './evidence.json';
import expected from './expected.json';

/**
 * A **real** month (October 2026), collected on a real machine by the real
 * collector and then anonymized by `scripts/anonymize-evidence.mjs`.
 *
 * What is genuine: every instant, the rhythm of the days, the volume of proofs,
 * the lines touched, the branch switches, the shape of the reflog. Nothing was
 * moved, trimmed or invented — `real-month.test.ts` recomputes the figures
 * below through the real pipeline, so they cannot drift from the product.
 *
 * What is a pseudonym: repository names (`projet-1`…`projet-3`), remotes,
 * branch names, local paths, evidence ids and the author address. Commit
 * messages were never collected (`--no-summaries`, HEU-N-07), so not one line
 * of anyone's work is reproduced here. The rates are placeholders, not prices.
 *
 * There is no calendar and no notes: this month is Git only, which is the
 * honest shape of a month nobody thought to record.
 */

/** The three repositories of the month, in the order the anonymizer numbered them. */
const REPOSITORIES = ['projet-1', 'projet-2', 'projet-3'] as const;

/** The hourly rate is a placeholder: what a real one is, is nobody's business. */
const PLACEHOLDER_RATE_CENTS = 6500;

export interface RealExpectedClient {
  readonly foundMinutes: number;
  readonly blockCount: number;
}

export interface RealExpected {
  readonly period: { readonly year: number; readonly month: number };
  readonly timeZone: string;
  readonly evidenceCount: number;
  readonly orphanCount: number;
  readonly ignoredAutomation: number;
  readonly foundMinutes: number;
  readonly confirmedMinutes: number;
  /** Nobody declared anything yet: the gap is for the reader to fill in. */
  readonly declaredMinutes: number | null;
  readonly ghostMinutes: number | null;
  readonly ghostAmountCents: number | null;
  readonly blockCount: number;
  readonly conflictCount: number;
  readonly unprovenBlocks: number;
  readonly solidBlocks: number;
  readonly activeDays: number;
  readonly assumedLeadInMinutes: number;
  readonly perClient: Readonly<Record<string, RealExpectedClient>>;
}

export interface RealMonth {
  readonly evidence: readonly Evidence[];
  readonly calendarIcs: string;
  readonly notes: readonly NoteFile[];
  readonly clients: readonly Client[];
  readonly settings: ReconstructionSettings;
  readonly declaredMinutes: Readonly<Record<string, number>>;
  readonly expected: RealExpected;
  readonly locale: SupportedLocale;
}

function rulesOf(repo: string): Client['rules'] {
  return [
    {
      id: ruleId(repo, 'repo', repo),
      clientId: repo,
      type: 'repo' as const,
      value: repo,
      projectId: repo,
    },
    {
      id: ruleId(repo, 'remote-contains', repo),
      clientId: repo,
      type: 'remote-contains' as const,
      value: `example.invalid:${repo}`,
      projectId: repo,
    },
  ];
}

/**
 * One client per repository. With real data the three projects overlap — two
 * agents on two checkouts of the same afternoon — and that overlap is exactly
 * what the contradiction screen exists for.
 */
export const realClients: readonly Client[] = REPOSITORIES.map((repo, index) => ({
  id: repo,
  name: `Projet ${index + 1}`,
  mode: 'hourly' as const,
  rateCents: PLACEHOLDER_RATE_CENTS,
  dayRateCents: 0,
  currency: 'EUR',
  rounding: { mode: 'nearest' as const, stepMinutes: 15, scope: 'day' as const },
  projects: [{ id: repo, name: repo }],
  rules: rulesOf(repo),
}));

export const realSettings: ReconstructionSettings = { ...DEFAULT_SETTINGS };

/** Nothing declared: this month is here to compare a memory with proofs. */
export const realDeclaredMinutes: Readonly<Record<string, number>> = {};

export function loadRealMonth(): RealMonth {
  const parsed = parseEvidenceFile(evidenceFile);
  return {
    evidence: unwrap(parsed, 'fixtures/real-month/evidence.json').evidence,
    calendarIcs: '',
    notes: [],
    clients: realClients,
    settings: realSettings,
    declaredMinutes: realDeclaredMinutes,
    expected: expected as RealExpected,
    locale: 'en',
  };
}

export { expected as realExpected };
