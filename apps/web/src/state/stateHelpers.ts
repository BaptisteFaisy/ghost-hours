import { dayKeyInZone, weekDaysInZone } from '@ghost-hours/core';
import type { Block, Evidence } from '@ghost-hours/core';
import { mergeEvidence, reconstruct } from './reconstruct.ts';
import type { ReconstructionOutcome } from './reconstruct.ts';
import { shouldUseWorker } from './reconstructAsync.ts';
import type { AppState } from './types.ts';

/**
 * The machinery every state transition shares (contract 3).
 *
 * These functions are pure: state in, state out, no React and no side effect.
 * They live apart from the reducer that calls them and from the provider that
 * renders it, so a transition can be read — and tested — without the shell.
 */

function manualEvidenceOf(state: AppState): readonly Evidence[] {
  return state.evidence.filter((item) => item.source === 'manual');
}

/** Apply a fresh reconstruction on top of the current state. */
export function withReconstruction(state: AppState, patch: Partial<AppState> = {}): AppState {
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
export function applyOutcome(
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

export function mapBlock(
  blocks: readonly Block[],
  blockId: string,
  change: (block: Block) => Block,
): readonly Block[] {
  return blocks.map((block) => (block.id === blockId ? change(block) : block));
}

export function setStatus(blocks: readonly Block[], blockId: string, status: Block['status']): readonly Block[] {
  return mapBlock(blocks, blockId, (block) => ({ ...block, status }));
}

export function setStatusIn(
  blocks: readonly Block[],
  ids: ReadonlySet<string>,
  status: Block['status'],
): readonly Block[] {
  return blocks.map((block) => (ids.has(block.id) ? { ...block, status } : block));
}

export function dayIds(state: AppState, dayKey: string): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const block of state.blocks) {
    if (dayKeyInZone(block.start, state.settings.timeZone) === dayKey) ids.add(block.id);
  }
  return ids;
}

export function weekIds(state: AppState, weekStart: number): ReadonlySet<string> {
  const ids = new Set<string>();
  const days = weekDaysInZone(weekStart, state.settings.timeZone);
  const start = days[0]?.start ?? weekStart;
  const end = days[days.length - 1]?.end ?? weekStart;
  for (const block of state.blocks) {
    if (block.start < end && block.end > start) ids.add(block.id);
  }
  return ids;
}

export function instantOf(item: Evidence): number {
  return item.at ?? item.start ?? 0;
}
