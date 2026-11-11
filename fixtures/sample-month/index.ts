import type { Client, Evidence, ReconstructionSettings, SupportedLocale } from '@ghost-hours/core';
import { DEFAULT_SETTINGS, parseEvidenceFile, ruleId, unwrap } from '@ghost-hours/core';
import type { NoteFile } from '@ghost-hours/notes';
import evidenceFile from './evidence.json';
import expected from './expected.json';
import calendarIcs from './calendar.ics?raw';
import note03 from './notes/2026-11-03.md?raw';
import note04 from './notes/2026-11-04.md?raw';
import note10 from './notes/2026-11-10.md?raw';
import note17 from './notes/2026-11-17.md?raw';
import note18 from './notes/2026-11-18.md?raw';
import note19 from './notes/2026-11-19.md?raw';
import note24 from './notes/2026-11-24.md?raw';
import note25 from './notes/2026-11-25.md?raw';

/**
 * The demo month: a fictitious freelancer, three fictitious clients, one month
 * of work. The numbers in `expected.json` are produced by the real pipeline
 * (the `.ics` reader, the notes reader and the sessionizer), not typed by hand:
 * the acceptance test recomputes them and fails if the product changes.
 *
 * Nothing here is real (HEU-N-06): only `example.com` / `example.org`
 * addresses, invented companies and invented people.
 */

export interface SampleExpected {
  readonly period: { readonly year: number; readonly month: number };
  readonly timeZone: string;
  readonly foundMinutes: number;
  readonly confirmedMinutes: number;
  readonly declaredMinutes: number;
  readonly ghostMinutes: number;
  readonly ghostAmountCents: number;
  readonly perClient: Readonly<Record<string, {
    readonly foundMinutes: number;
    readonly declaredMinutes: number;
    readonly ghostMinutes: number;
    readonly ghostAmountCents: number;
  }>>;
  readonly blockCount: number;
  readonly conflictCount: number;
  readonly unprovenBlocks: number;
}

export interface SampleMonth {
  readonly evidence: readonly Evidence[];
  readonly calendarIcs: string;
  readonly notes: readonly NoteFile[];
  readonly clients: readonly Client[];
  readonly settings: ReconstructionSettings;
  readonly declaredMinutes: Readonly<Record<string, number>>;
  readonly expected: SampleExpected;
  readonly locale: SupportedLocale;
}

function rules(clientId: string, repo: string, domain: string, tag: string, projectId: string) {
  return [
    { id: ruleId(clientId, 'repo', repo), clientId, type: 'repo' as const, value: repo, projectId },
    { id: ruleId(clientId, 'remote-contains', domain), clientId, type: 'remote-contains' as const, value: `${clientId}/${repo}`, projectId },
    { id: ruleId(clientId, 'attendee-domain', domain), clientId, type: 'attendee-domain' as const, value: domain, projectId: null },
    { id: ruleId(clientId, 'note-tag', tag), clientId, type: 'note-tag' as const, value: tag, projectId: null },
  ];
}

export const sampleClients: readonly Client[] = [
  {
    id: 'acme',
    name: 'Acme',
    mode: 'hourly',
    rateCents: 6500,
    dayRateCents: 52000,
    currency: 'EUR',
    rounding: { mode: 'nearest', stepMinutes: 15, scope: 'day' },
    projects: [{ id: 'acme-api', name: 'Acme API' }],
    rules: rules('acme', 'acme-api', 'acme.example.org', 'acme', 'acme-api'),
  },
  {
    id: 'northwind',
    name: 'Northwind',
    mode: 'daily-thresholds',
    rateCents: 7400,
    dayRateCents: 52000,
    currency: 'EUR',
    rounding: { mode: 'nearest', stepMinutes: 15, scope: 'day' },
    projects: [{ id: 'northwind-portal', name: 'Northwind portal' }],
    rules: rules('northwind', 'northwind-portal', 'northwind.example.org', 'northwind', 'northwind-portal'),
  },
  {
    id: 'globex',
    name: 'Globex',
    mode: 'daily-proportional',
    rateCents: 6800,
    dayRateCents: 48000,
    currency: 'EUR',
    rounding: { mode: 'none', stepMinutes: 15, scope: 'total' },
    projects: [{ id: 'globex-etl', name: 'Globex ETL' }],
    rules: rules('globex', 'globex-etl', 'globex.example.org', 'globex', 'globex-etl'),
  },
];

export const sampleSettings: ReconstructionSettings = { ...DEFAULT_SETTINGS };

export const sampleDeclaredMinutes: Readonly<Record<string, number>> = {
  acme: 3000,
  northwind: 1560,
  globex: 960,
};

const noteFiles: readonly NoteFile[] = [
  { path: '2026-11-03.md', content: note03 },
  { path: '2026-11-04.md', content: note04 },
  { path: '2026-11-10.md', content: note10 },
  { path: '2026-11-17.md', content: note17 },
  { path: '2026-11-18.md', content: note18 },
  { path: '2026-11-19.md', content: note19 },
  { path: '2026-11-24.md', content: note24 },
  { path: '2026-11-25.md', content: note25 },
];

export function loadSampleMonth(): SampleMonth {
  const parsed = parseEvidenceFile(evidenceFile);
  return {
    evidence: unwrap(parsed, 'fixtures/sample-month/evidence.json').evidence,
    calendarIcs,
    notes: noteFiles,
    clients: sampleClients,
    settings: sampleSettings,
    declaredMinutes: sampleDeclaredMinutes,
    expected: expected as SampleExpected,
    locale: 'en',
  };
}

export { expected as sampleExpected };
