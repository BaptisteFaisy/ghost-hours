import { monthOfInZone } from '@ghost-hours/core';
import type { Client, Dataset, Evidence } from '@ghost-hours/core';
import { parseNotes } from '@ghost-hours/notes';
import { loadSampleMonth } from '@ghost-hours/fixture-sample-month';
import { mergeEvidence, reconstruct } from './reconstruct.ts';
import { calendarEvidence } from './calendar.ts';
import { instantOf, withReconstruction } from './stateHelpers.ts';
import { DEFAULT_ACTIVE_MONTH } from './types.ts';
import type { AppState } from './types.ts';

/**
 * The transitions that bring data in (D.7 P1→P3): the sample month, an
 * iCalendar file, dated Markdown notes, a saved dataset, and the client list.
 * Importing never decides anything about the work itself — it feeds the
 * reconstruction, which is the only place blocks are made.
 */

export function upsertClient(client: Client, clients: readonly Client[]): readonly Client[] {
  return [...clients.filter((item) => item.id !== client.id), client];
}

export function loadSample(state: AppState): AppState {
  const sample = loadSampleMonth();
  const calendar = parseCalendarEvidence(sample.calendarIcs, state.settings.timeZone);
  const notes = parseNoteEvidence(sample.notes, state.settings.timeZone);
  const evidence = mergeEvidence(mergeEvidence(sample.evidence, calendar), notes);
  const outcome = reconstruct(evidence, sample.clients, sample.settings, [], []);
  return {
    ...state,
    status: 'ready',
    settings: sample.settings,
    clients: sample.clients,
    evidence: outcome.evidence,
    blocks: outcome.blocks,
    conflicts: outcome.conflicts,
    calibration: outcome.calibration,
    ignoredEvidence: outcome.ignored,
    orphanEvidence: outcome.orphans,
    declaredMinutes: { ...sample.declaredMinutes },
    activeMonth: monthOfEvidence(evidence, state.settings.timeZone),
    importReport: [`sample: ${evidence.length} proofs`, `sample: ${outcome.blocks.length} blocks`],
  };
}

/** Delegates to `state/calendar.ts`: recurrences are expanded there. */
function parseCalendarEvidence(ics: string, timeZone: string): readonly Evidence[] {
  return calendarEvidence(ics, timeZone).evidence;
}

function parseNoteEvidence(
  notes: readonly { path: string; content: string }[],
  timeZone: string,
): readonly Evidence[] {
  return parseNotes(notes, { defaultTimeZone: timeZone }).evidence;
}

/** The month the imported proofs live in, from the earliest one. */
function monthOfEvidence(
  evidence: readonly Evidence[],
  timeZone: string,
): { year: number; month: number } {
  const first = [...evidence].sort((left, right) => instantOf(left) - instantOf(right))[0];
  if (first === undefined) return { ...DEFAULT_ACTIVE_MONTH };
  const range = monthOfInZone(instantOf(first), timeZone);
  return { year: range.year, month: range.month };
}

export function importCalendar(state: AppState, ics: string): AppState {
  const imported = calendarEvidence(ics, state.settings.timeZone);
  if (imported.evidence.length === 0) {
    return { ...state, importReport: [...state.importReport, ...imported.report] };
  }
  return withReconstruction(state, {
    evidence: mergeEvidence(state.evidence, imported.evidence),
    importReport: [...state.importReport, ...imported.report],
  });
}

export function importNotes(state: AppState, notes: readonly { path: string; content: string }[]): AppState {
  const report = parseNotes(notes, { defaultTimeZone: state.settings.timeZone });
  return withReconstruction(state, {
    evidence: mergeEvidence(state.evidence, report.evidence),
    importReport: [
      ...state.importReport,
      `notes: ${report.evidence.length} proofs`,
      ...report.skipped.map((item) => `skipped: ${item.path}`),
    ],
  });
}

export function importDataset(state: AppState, dataset: Dataset): AppState {
  return {
    ...state,
    status: 'ready',
    locale: dataset.locale,
    settings: dataset.settings,
    clients: dataset.clients,
    blocks: dataset.blocks,
    conflicts: dataset.conflicts,
    declaredMinutes: { ...dataset.declaredMinutes },
    invoicedPeriods: dataset.invoicedPeriods.map((period) => ({ ...period })),
    importReport: [...state.importReport, 'dataset: imported'],
  };
}
