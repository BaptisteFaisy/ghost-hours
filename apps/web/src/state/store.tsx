import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { buildDataset, resolveSettings } from '@ghost-hours/core';
import { clearState, loadState, saveState } from './persistence.ts';
import type { PersistedState } from './persistence.ts';
import { reconstruct } from './reconstruct.ts';
import { reconstructAsync } from './reconstructAsync.ts';
import { reduce } from './transitions.ts';
import { initialState } from './types.ts';
import type { AppAction, AppState, PendingReconstruction, StorageWarning } from './types.ts';

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
function usePersist(
  state: AppState,
  hydrated: boolean,
  setWarning: (warning: StorageWarning | null) => void,
): void {
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void saveState(toPersisted(state)).then((result) => {
      if (cancelled || result.ok) return;
      setWarning({ kind: 'write', reason: result.errors.join('; ') });
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, state, setWarning]);
}

export function AppProvider(props: { children: ReactNode }): JSX.Element {
  const [state, rawDispatch] = useReducer(reduce, initialState(EMPTY_SETTINGS));
  const [hydrated, setHydrated] = useState(false);
  const [storageWarning, setStorageWarning] = useState<StorageWarning | null>(null);
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
        setStorageWarning({ kind: result.kind, reason: result.errors.join('; ') });
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

  usePersist(state, hydrated, setStorageWarning);

  const value = useMemo<AppState>(
    () => withStorageWarning(state, storageWarning),
    [storageWarning, state],
  );

  return (
    <AppStateContext.Provider value={value}>
      <AppDispatchContext.Provider value={dispatch}>{props.children}</AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

/**
 * Fold a storage failure into the state: the raw reason stays in the import
 * report of the settings screen, and the shell gets a field it can announce.
 */
function withStorageWarning(state: AppState, warning: StorageWarning | null): AppState {
  if (warning === null) return state;
  return {
    ...state,
    importReport: [...state.importReport, warning.reason],
    storageWarning: warning,
  };
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
