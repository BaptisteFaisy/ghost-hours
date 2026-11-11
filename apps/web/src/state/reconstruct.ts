import { applyRules } from '@ghost-hours/mapping';
import { sessionize } from '@ghost-hours/sessionizer';
import type { LeadInCorrection } from '@ghost-hours/sessionizer';
import type { Block, Client, Conflict, Evidence, ReconstructionSettings } from '@ghost-hours/core';

/**
 * The reconstruction step (D.5), called by the reducer whenever the evidence,
 * the settings, the clients or the rules change.
 *
 * The user's decisions travel with the reconstruction: the blocks of an
 * invoiced period are passed as `lockedBlocks` (they come out untouched,
 * HEU-F-29) and the blocks the user resized are passed as `adjustedBlocks`.
 */
export interface ReconstructionOutcome {
  readonly blocks: readonly Block[];
  readonly conflicts: readonly Conflict[];
  readonly orphans: readonly Evidence[];
  readonly evidence: readonly Evidence[];
}

function dedupeById(items: readonly Evidence[]): readonly Evidence[] {
  const seen = new Set<string>();
  const out: Evidence[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/** Manual entries are declared, not derived: they never feed the sessionizer. */
function derivableEvidence(evidence: readonly Evidence[]): readonly Evidence[] {
  return evidence.filter((item) => item.source !== 'manual');
}

/**
 * Keep the decisions the user already made: a block the user confirmed stays
 * confirmed across a reconstruction, unless the new reconstruction itself
 * found a conflict — prudence wins over memory.
 */
function overlayDecisions(previous: readonly Block[], next: readonly Block[]): readonly Block[] {
  const byId = new Map(previous.map((block) => [block.id, block]));
  return next.map((block) => {
    const before = byId.get(block.id);
    if (before === undefined) return block;
    const keepStatus = block.status === 'proposed' && (before.status === 'confirmed' || before.status === 'rejected');
    return {
      ...block,
      status: keepStatus ? before.status : block.status,
      adjusted: block.adjusted || before.adjusted,
      note: block.note ?? before.note,
    };
  });
}

export function reconstruct(
  evidence: readonly Evidence[],
  clients: readonly Client[],
  settings: ReconstructionSettings,
  previousBlocks: readonly Block[],
  corrections: readonly LeadInCorrection[],
): ReconstructionOutcome {
  const mapping = applyRules(derivableEvidence(evidence), clients);
  const lockedBlocks = previousBlocks.filter((block) => block.status === 'locked');
  const adjustedBlocks = previousBlocks.filter(
    (block) => block.adjusted && block.status !== 'locked',
  );
  const result = sessionize({
    evidence: mapping.mapped,
    clients,
    settings,
    lockedBlocks,
    adjustedBlocks,
    corrections,
  });
  const orphans = dedupeById([...mapping.orphans, ...result.orphanEvidence]);
  const blocks = overlayDecisions(previousBlocks, result.blocks);
  return {
    blocks,
    conflicts: result.conflicts,
    orphans,
    evidence: dedupeById([...mapping.mapped, ...orphans]),
  };
}

/** Merge imported evidence with what is already known (HEU-P-14: no duplicate). */
export function mergeEvidence(
  current: readonly Evidence[],
  incoming: readonly Evidence[],
): readonly Evidence[] {
  const seen = new Set(current.map((item) => item.id));
  const out = [...current];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
