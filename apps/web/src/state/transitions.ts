import { DEFAULT_SETTINGS, dayKeyInZone, resolveSettings } from '@ghost-hours/core';
import type { Block, Evidence } from '@ghost-hours/core';
import { removeRule, upsertRule } from '@ghost-hours/mapping';
import { appendAudit, AUDITED_ACTIONS, describeAction } from './audit.ts';
import { mergeEvidence } from './reconstruct.ts';
import {
  applyOutcome,
  dayIds,
  mapBlock,
  setStatus,
  setStatusIn,
  weekIds,
  withReconstruction,
} from './stateHelpers.ts';
import {
  importCalendar,
  importDataset,
  importNotes,
  loadSample,
  upsertClient,
} from './importTransitions.ts';
import { initialState } from './types.ts';
import type { AppAction, AppState } from './types.ts';

/**
 * The reducer (contract 3): the only place where the state changes. Every
 * action that touches the evidence, the settings, the clients or the rules
 * triggers a fresh reconstruction, so the blocks on screen always come from the
 * same algorithm that produced them (HEU-F-29: locked and adjusted blocks
 * travel with the reconstruction).
 */

/**
 * Every decision leaves a trace: the reducer appends an audit entry for the
 * actions that change data, never for the ones that only move the view.
 */
export function reduce(state: AppState, action: AppAction): AppState {
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
