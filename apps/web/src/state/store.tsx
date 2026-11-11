import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_SETTINGS, buildDataset, dayKeyInZone, monthOfInZone, resolveSettings, weekDaysInZone } from '@ghost-hours/core';
import type { Block, Client, Dataset, Evidence } from '@ghost-hours/core';
import { parseNotes } from '@ghost-hours/notes';
import { removeRule, upsertRule } from '@ghost-hours/mapping';
import { loadSampleMonth } from '@ghost-hours/fixture-sample-month';
import { mergeEvidence, reconstruct } from './reconstruct.ts';
import { clearState, loadState, saveState } from './persistence.ts';
import { appendAudit, AUDITED_ACTIONS, describeAction } from './audit.ts';
import { reconstructAsync, shouldUseWorker } from './reconstructAsync.ts';
import type { ReconstructionOutcome } from './reconstruct.ts';
import { calendarEvidence } from './calendar.ts';
import type { PersistedState } from './persistence.ts';
import { DEFAULT_ACTIVE_MONTH, initialState } from './types.ts';
import type { AppAction, AppState, PendingReconstruction } from './types.ts';

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
  // A big month is rebuilt off the main thread so the interface never freezes
  // (idea R-01): the reducer records the request, the provider runs it.
  if (shouldUseWorker(evidence.length)) {
    return {
      ...state,
      ...patch,
      status: 'ready',
      busy: true,
      pending: {
        evidence: mergeEvidence(evidence, manualEvidenceOf(state)),
        clients,
        settings,
        previousBlocks: previous,
        corrections: state.corrections,
      },
    };
  }
  return applyOutcome(state, patch, reconstruct(evidence, clients, settings, previous, state.corrections));
}

/** The second half of a reconstruction, shared by the sync and worker paths. */
function applyOutcome(
  state: AppState,
  patch: Partial<AppState>,
  outcome: ReconstructionOutcome,
): AppState {
  return {
    ...state,
    ...patch,
    status: 'ready',
    busy: false,
    pending: null,
    blocks: outcome.blocks,
    conflicts: outcome.conflicts,
    calibration: outcome.calibration,
    ignoredEvidence: outcome.ignored,
    orphanEvidence: outcome.orphans,
    evidence: mergeEvidence(outcome.evidence, manualEvidenceOf(state)),
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

/**
 * Every decision leaves a trace: the reducer appends an audit entry for the
 * actions that change data, never for the ones that only move the view.
 */
function reduce(state: AppState, action: AppAction): AppState {
  const next = applyAction(state, action);
  if (!AUDITED_ACTIONS.has(action.type)) return next;
  const detail = describeAction(action as unknown as Record<string, unknown>);
  return {
    ...next,
    audit: appendAudit(state.audit, {
      at: Date.now(),
      action: action.type,
      ...(detail === undefined ? {} : { detail }),
    }),
  };
}

function applyAction(state: AppState, action: AppAction): AppState {
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
    case 'splitConflict': return splitConflict(state, action.conflictId);
    case 'restoreAudit': return { ...state, audit: action.entries };
    case 'applyReconstruction': return applyOutcome(state, {}, action.outcome);
    case 'confirmDay': return { ...state, blocks: setStatusIn(state.blocks, dayIds(state, action.dayKey), 'confirmed') };
    case 'confirmWeek': return { ...state, blocks: setStatusIn(state.blocks, weekIds(state, action.weekStart), 'confirmed') };
    case 'confirmSolidBlocks': return { ...state, blocks: setStatusIn(state.blocks, solidIds(state, action.threshold), 'confirmed') };
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

function importCalendar(state: AppState, ics: string): AppState {
  const imported = calendarEvidence(ics, state.settings.timeZone);
  if (imported.evidence.length === 0) {
    return { ...state, importReport: [...state.importReport, ...imported.report] };
  }
  return withReconstruction(state, {
    evidence: mergeEvidence(state.evidence, imported.evidence),
    importReport: [...state.importReport, ...imported.report],
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

/**
 * The third way out of a contradiction: share the minutes. Each side keeps the
 * half of the overlap that is closest to it, both blocks come back as
 * *proposed* (so the user still confirms them) and both are marked adjusted,
 * which is what keeps a later reconstruction from undoing the decision.
 */
function splitConflict(state: AppState, conflictId: string): AppState {
  const conflict = state.conflicts.find((item) => item.id === conflictId);
  if (conflict === undefined) return state;
  const involved = state.blocks
    .filter((block) => conflict.blockIds.includes(block.id))
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const first = involved[0];
  const second = involved[1];
  const middle = Math.round((conflict.start + conflict.end) / 2);
  const blocks = state.blocks.map((block) => {
    if (first !== undefined && block.id === first.id) {
      return { ...block, end: Math.max(block.start, Math.min(middle, block.end)), status: 'proposed' as const, adjusted: true };
    }
    if (second !== undefined && block.id === second.id) {
      return { ...block, start: Math.min(block.end, Math.max(middle, block.start)), status: 'proposed' as const, adjusted: true };
    }
    if (conflict.blockIds.includes(block.id)) return { ...block, status: 'rejected' as const };
    return block;
  });
  return {
    ...state,
    blocks,
    conflicts: state.conflicts.map((item) => (item.id === conflictId ? { ...item, resolved: true } : item)),
  };
}

/**
 * One gesture for the easy cases (idea U-17): confirm every proposed block of
 * the active month whose proven share reaches the threshold, and leave the
 * rest for the review. The threshold is a parameter, not a constant, so the
 * interface can offer "everything solid" and "everything at least likely".
 */
/**
 * Ids of the blocks one gesture can confirm (idea U-17): proposed, inside the
 * active month, and proven enough. The threshold is a parameter so the
 * interface can offer "everything solid" or "everything at least likely".
 */
function solidIds(state: AppState, threshold: number): ReadonlySet<string> {
  const prefix = `${state.activeMonth.year}-${String(state.activeMonth.month).padStart(2, '0')}`;
  return new Set(
    state.blocks
      .filter(
        (block) =>
          block.status === 'proposed' &&
          block.provenShare >= threshold &&
          dayKeyInZone(block.start, state.settings.timeZone).startsWith(prefix),
      )
      .map((block) => block.id),
  );
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
    audit: state.audit,
  };
}

/**
 * Runs a deferred reconstruction in a worker, then applies its outcome. On
 * failure the same reconstruction is computed synchronously: losing a month of
 * import because a worker died is not an option.
 */
function useDeferredReconstruction(
  pending: PendingReconstruction | null,
  rawDispatch: (action: AppAction) => void,
): void {
  useEffect(() => {
    if (pending === null) return;
    let cancelled = false;
    void reconstructAsync(pending)
      .catch(() =>
        reconstruct(pending.evidence, pending.clients, pending.settings, pending.previousBlocks, pending.corrections),
      )
      .then((outcome) => {
        if (!cancelled) rawDispatch({ type: 'applyReconstruction', outcome });
      });
    return () => {
      cancelled = true;
    };
  }, [pending, rawDispatch]);
}

/**
 * Writes the state to IndexedDB after every change, once the restore has
 * landed. A failed write is reported in the state, never thrown: losing a
 * gesture silently is worse than showing a warning.
 */
function usePersist(state: AppState, hydrated: boolean, setSaveError: (message: string | null) => void): void {
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
  }, [hydrated, state, setSaveError]);
}

/* ---------------------------------------------------------- the shell -- */

export function AppProvider(props: { children: ReactNode }): JSX.Element {
  const [state, rawDispatch] = useReducer(reduce, initialState(EMPTY_SETTINGS));
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Restoring from IndexedDB is asynchronous: a gesture made in the first
  // milliseconds must not be erased by the restored state, so it is replayed
  // on top of it once the restore lands.
  const hydratedRef = useRef(false);
  const pendingRef = useRef<AppAction[]>([]);
  const dispatch = useCallback((action: AppAction) => {
    if (!hydratedRef.current) pendingRef.current.push(action);
    rawDispatch(action);
  }, []);

  useDeferredReconstruction(state.pending, rawDispatch);

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
        if (restored.audit !== undefined && restored.audit.length > 0) {
          rawDispatch({ type: 'restoreAudit', entries: restored.audit });
        }
      }
      for (const action of pendingRef.current) rawDispatch(action);
      pendingRef.current = [];
      hydratedRef.current = true;
    }).finally(() => {
      if (!cancelled) setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  usePersist(state, hydrated, setSaveError);

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
