import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_SETTINGS, buildDataset, dayKeyInZone, monthOfInZone, resolveSettings, weekDaysInZone } from '@ghost-hours/core';
import type { Block, Client, Dataset, Evidence } from '@ghost-hours/core';
import { parseIcs, toEvidence } from '@ghost-hours/ics';
import { parseNotes } from '@ghost-hours/notes';
import { removeRule, upsertRule } from '@ghost-hours/mapping';
import { loadSampleMonth } from '@ghost-hours/fixture-sample-month';
import { mergeEvidence, reconstruct } from './reconstruct.ts';
import { clearState, loadState, saveState } from './persistence.ts';
import type { PersistedState } from './persistence.ts';
import { DEFAULT_ACTIVE_MONTH, initialState } from './types.ts';
import type { AppAction, AppState } from './types.ts';

/**
 * The store (contract 3): one reducer, one context.
 *
 * The reducer is the only place where the state changes. Every action that
 * touches the evidence, the settings, the clients or the rules triggers a
 * fresh reconstruction, so the blocks on screen always come from the same
 * algorithm that produced them (HEU-F-29: the locked and the adjusted blocks
 * travel with the reconstruction).
 *
 * Persistence is fire-and-forget: it never blocks the UI and never throws. A
 * failed write lands in `importReport`.
 */

const AppStateContext = createContext<AppState | null>(null);
const AppDispatchContext = createContext<((action: AppAction) => void) | null>(null);

const EMPTY_SETTINGS = resolveSettings({});

/* ------------------------------------------------------------- helpers -- */

function manualEvidenceOf(state: AppState): readonly Evidence[] {
  return state.evidence.filter((item) => item.source === 'manual');
}

/** Apply a fresh reconstruction on top of the current state. */
function withReconstruction(state: AppState, patch: Partial<AppState> = {}): AppState {
  const evidence = patch.evidence ?? state.evidence;
  const clients = patch.clients ?? state.clients;
  const settings = patch.settings ?? state.settings;
  const previous = patch.blocks ?? state.blocks;
  const outcome = reconstruct(evidence, clients, settings, previous, state.corrections);
  const merged = mergeEvidence(outcome.evidence, manualEvidenceOf(state));
  return {
    ...state,
    ...patch,
    status: 'ready',
    blocks: outcome.blocks,
    conflicts: outcome.conflicts,
    orphanEvidence: outcome.orphans,
    evidence: merged,
  };
}

function mapBlock(
  blocks: readonly Block[],
  blockId: string,
  change: (block: Block) => Block,
): readonly Block[] {
  return blocks.map((block) => (block.id === blockId ? change(block) : block));
}

function setStatus(blocks: readonly Block[], blockId: string, status: Block['status']): readonly Block[] {
  return mapBlock(blocks, blockId, (block) => ({ ...block, status }));
}

function setStatusIn(
  blocks: readonly Block[],
  ids: ReadonlySet<string>,
  status: Block['status'],
): readonly Block[] {
  return blocks.map((block) => (ids.has(block.id) ? { ...block, status } : block));
}

function dayIds(state: AppState, dayKey: string): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const block of state.blocks) {
    if (dayKeyInZone(block.start, state.settings.timeZone) === dayKey) ids.add(block.id);
  }
  return ids;
}

function weekIds(state: AppState, weekStart: number): ReadonlySet<string> {
  const ids = new Set<string>();
  const days = weekDaysInZone(weekStart, state.settings.timeZone);
  const start = days[0]?.start ?? weekStart;
  const end = days[days.length - 1]?.end ?? weekStart;
  for (const block of state.blocks) {
    if (block.start < end && block.end > start) ids.add(block.id);
  }
  return ids;
}

function instantOf(item: Evidence): number {
  return item.at ?? item.start ?? 0;
}

/* ------------------------------------------------------- the reducer -- */

function reduce(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'loadSampleMonth': return loadSample(state);
    case 'importEvidence': return withReconstruction(state, { evidence: mergeEvidence(state.evidence, action.evidence) });
    case 'importCalendar': return importCalendar(state, action.ics);
    case 'importNotes': return importNotes(state, action.notes);
    case 'addManualBlock': return addManualBlock(state, action.start, action.end, action.clientId);
    case 'reconstruct': return withReconstruction(state);
    case 'confirmBlock': return { ...state, blocks: setStatus(state.blocks, action.blockId, 'confirmed') };
    case 'rejectBlock': return { ...state, blocks: setStatus(state.blocks, action.blockId, 'rejected') };
    case 'adjustBlock': return adjustBlock(state, action.blockId, action.start, action.end);
    case 'splitBlock': return splitBlock(state, action.blockId, action.at);
    case 'changeClient': return changeClient(state, action.blockId, action.clientId, action.projectId);
    case 'resolveConflict': return resolveConflict(state, action.conflictId, action.keepBlockId);
    case 'confirmDay': return { ...state, blocks: setStatusIn(state.blocks, dayIds(state, action.dayKey), 'confirmed') };
    case 'confirmWeek': return { ...state, blocks: setStatusIn(state.blocks, weekIds(state, action.weekStart), 'confirmed') };
    case 'upsertClient': return withReconstruction(state, { clients: upsertClient(action.client, state.clients) });
    case 'upsertRule': return withReconstruction(state, { clients: upsertRule(state.clients, action.rule) });
    case 'removeRule': return withReconstruction(state, { clients: removeRule(state.clients, action.ruleId) });
    case 'setSettings': return withReconstruction(state, { settings: resolveSettings(action.patch) });
    case 'setLocale': return { ...state, locale: action.locale };
    case 'setDeclared': return { ...state, declaredMinutes: { ...state.declaredMinutes, [action.clientId]: action.minutes } };
    case 'setTaxRate': return { ...state, taxRateBp: action.basisPoints };
    case 'setNotes': return { ...state, freeTextNotes: [...action.notes] };
    case 'setAnnexDetail': return { ...state, annexDetail: action.detail };
    case 'setActiveMonth': return { ...state, activeMonth: { year: action.year, month: action.month } };
    case 'setActiveWeek': return { ...state, activeWeekStart: action.weekStart };
    case 'selectBlock': return { ...state, selectedBlockId: action.blockId };
    case 'markPeriodInvoiced': return markPeriodInvoiced(state, action.clientId, action.start, action.end);
    case 'importDataset': return importDataset(state, action.dataset);
    case 'resetAll': return initialState(DEFAULT_SETTINGS);
    default: return state;
  }
}

/* ------------------------------------------------------------ imports -- */

function upsertClient(client: Client, clients: readonly Client[]): readonly Client[] {
  return [...clients.filter((item) => item.id !== client.id), client];
}

function loadSample(state: AppState): AppState {
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
    orphanEvidence: outcome.orphans,
    declaredMinutes: { ...sample.declaredMinutes },
    activeMonth: monthOfEvidence(evidence, state.settings.timeZone),
    importReport: [`sample: ${evidence.length} proofs`, `sample: ${outcome.blocks.length} blocks`],
  };
}

function parseCalendarEvidence(ics: string, timeZone: string): readonly Evidence[] {
  const parsed = parseIcs(ics, { defaultTimeZone: timeZone });
  if (!parsed.ok) return [];
  return toEvidence(parsed.value.events, { defaultTimeZone: timeZone });
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

function importCalendar(state: AppState, ics: string): AppState {
  const parsed = parseIcs(ics, { defaultTimeZone: state.settings.timeZone });
  if (!parsed.ok) {
    return { ...state, importReport: [...state.importReport, ...parsed.errors] };
  }
  const evidence = toEvidence(parsed.value.events, { defaultTimeZone: state.settings.timeZone });
  const skipped = parsed.value.skipped.map((item) => `skipped: ${item.reason}`);
  return withReconstruction(state, {
    evidence: mergeEvidence(state.evidence, evidence),
    importReport: [...state.importReport, `calendar: ${evidence.length} events`, ...skipped],
  });
}

function importNotes(state: AppState, notes: readonly { path: string; content: string }[]): AppState {
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

function importDataset(state: AppState, dataset: Dataset): AppState {
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

/* ------------------------------------------------------------- blocks -- */

function addManualBlock(state: AppState, start: number, end: number, clientId: string): AppState {
  const evidence: Evidence = {
    id: `manual:${clientId}:${start}`,
    source: 'manual',
    kind: 'manual',
    clientId,
    start,
    end,
  };
  const block: Block = {
    id: `manual-block:${clientId}:${start}`,
    start,
    end,
    clientId,
    projectId: null,
    status: 'proposed',
    origin: 'manual',
    provenShare: 0,
    confidence: 'to-confirm',
    assumedLeadInMinutes: 0,
    evidenceIds: [evidence.id],
    locked: false,
    adjusted: true,
  };
  return withReconstruction(state, {
    evidence: [...state.evidence, evidence],
    blocks: [...state.blocks, block],
  });
}

function adjustBlock(state: AppState, blockId: string, start: number, end: number): AppState {
  const blocks = mapBlock(state.blocks, blockId, (block) => ({ ...block, start, end, adjusted: true }));
  return withReconstruction(state, { blocks });
}

function splitBlock(state: AppState, blockId: string, at: number): AppState {
  const block = state.blocks.find((item) => item.id === blockId);
  if (block === undefined || at <= block.start || at >= block.end) return state;
  const left: Block = { ...block, end: at, adjusted: true };
  const right: Block = { ...block, id: `${block.id}:b`, start: at, adjusted: true };
  const blocks = [...state.blocks.filter((item) => item.id !== blockId), left, right];
  return withReconstruction(state, { blocks });
}

function changeClient(
  state: AppState,
  blockId: string,
  clientId: string,
  projectId: string | null,
): AppState {
  const blocks = mapBlock(state.blocks, blockId, (block) => ({
    ...block,
    clientId,
    projectId,
    adjusted: true,
  }));
  return withReconstruction(state, { blocks });
}

function resolveConflict(state: AppState, conflictId: string, keepBlockId: string): AppState {
  const conflict = state.conflicts.find((item) => item.id === conflictId);
  const conflicts = state.conflicts.map((item) =>
    item.id === conflictId ? { ...item, resolved: true } : item,
  );
  if (conflict === undefined) return { ...state, conflicts };
  const blocks = state.blocks.map((block) => {
    if (!conflict.blockIds.includes(block.id)) return block;
    return { ...block, status: block.id === keepBlockId ? ('confirmed' as const) : ('rejected' as const) };
  });
  return { ...state, blocks, conflicts };
}

function markPeriodInvoiced(
  state: AppState,
  clientId: string,
  start: number,
  end: number,
): AppState {
  const blocks = state.blocks.map((block) => {
    if (block.clientId !== clientId) return block;
    if (block.start >= end || block.end <= start) return block;
    return { ...block, status: 'locked' as const, locked: true };
  });
  const invoicedPeriods = [
    ...state.invoicedPeriods.filter(
      (period) => !(period.clientId === clientId && period.start === start && period.end === end),
    ),
    { clientId, start, end },
  ];
  return { ...state, blocks, invoicedPeriods };
}

/* ------------------------------------------------------- persistence -- */

function toPersisted(state: AppState): PersistedState {
  return {
    dataset: buildDataset({
      exportedAt: Date.now(),
      locale: state.locale,
      settings: state.settings,
      clients: state.clients,
      blocks: state.blocks,
      conflicts: state.conflicts,
      declaredMinutes: state.declaredMinutes,
      invoicedPeriods: state.invoicedPeriods,
    }),
    evidence: state.evidence,
    corrections: state.corrections,
    taxRateBp: state.taxRateBp,
    freeTextNotes: state.freeTextNotes,
    annexDetail: state.annexDetail,
    activeMonth: state.activeMonth,
    activeWeekStart: state.activeWeekStart,
  };
}

/* ---------------------------------------------------------- the shell -- */

export function AppProvider(props: { children: ReactNode }): JSX.Element {
  const [state, rawDispatch] = useReducer(reduce, initialState(EMPTY_SETTINGS));
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dispatch = useCallback((action: AppAction) => rawDispatch(action), []);

  useEffect(() => {
    let cancelled = false;
    void loadState().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setSaveError(result.errors.join('; '));
        return;
      }
      const restored = result.value;
      if (restored !== null) {
        rawDispatch({ type: 'importDataset', dataset: restored.dataset });
        rawDispatch({ type: 'importEvidence', evidence: restored.evidence });
      }
    }).finally(() => {
      if (!cancelled) setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void saveState(toPersisted(state)).then((result) => {
      if (cancelled || result.ok) return;
      setSaveError(result.errors.join('; '));
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, state]);

  const value = useMemo<AppState>(
    () => (saveError === null ? state : { ...state, importReport: [...state.importReport, saveError] }),
    [saveError, state],
  );

  return (
    <AppStateContext.Provider value={value}>
      <AppDispatchContext.Provider value={dispatch}>{props.children}</AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

/** The current application state. */
export function useApp(): AppState {
  const state = useContext(AppStateContext);
  if (state === null) throw new Error('useApp must be used inside an AppProvider');
  return state;
}

/** The dispatcher of the application. */
export function useDispatch(): (action: AppAction) => void {
  const dispatch = useContext(AppDispatchContext);
  if (dispatch === null) throw new Error('useDispatch must be used inside an AppProvider');
  return dispatch;
}

/** Erase everything this app stored in this browser. */
export async function eraseEverything(): Promise<void> {
  await clearState();
}

export type { AppAction, AppState };
