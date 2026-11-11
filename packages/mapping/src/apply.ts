import type { Client, Evidence } from '@ghost-hours/core';
import { DEFAULT_PRECEDENCE } from './types.ts';
import type { MappingResult, RulePrecedence } from './types.ts';
import { matchRuleFor, resolveProjectId } from './match.ts';

/**
 * Attribute every evidence to a client, or leave it orphan (HEU-F-08/09).
 *
 * Two guarantees hold whatever the input order:
 * - an evidence already carrying a `clientId` that still exists keeps it
 *   (HEU-P-14: re-importing the same proofs changes nothing);
 * - no evidence is invented a client: a `clientId` in the result always
 *   comes from the `clients` argument.
 *
 * The output is sorted by (`at`, `id`) so two runs on shuffled inputs are
 * equal, not merely equivalent (HEU-F-16).
 */
export function applyRules(
  evidence: readonly Evidence[],
  clients: readonly Client[],
  precedence: RulePrecedence = DEFAULT_PRECEDENCE,
): MappingResult {
  const mapped: Evidence[] = [];
  const orphans: Evidence[] = [];
  for (const item of evidence) {
    const attributed = attribute(item, clients, precedence);
    if (attributed.clientId === null) orphans.push(attributed);
    else mapped.push(attributed);
  }
  return { mapped: sortEvidence(mapped), orphans: sortEvidence(orphans) };
}

function attribute(item: Evidence, clients: readonly Client[], precedence: RulePrecedence): Evidence {
  const known = findClient(clients, item.clientId);
  if (known !== undefined) {
    return { ...item, clientId: known.id, projectId: resolveProjectId(item, known, null) };
  }
  const match = matchRuleFor(item, clients, precedence);
  if (match === null) return { ...item, clientId: null };
  return {
    ...item,
    clientId: match.client.id,
    projectId: resolveProjectId(item, match.client, match.rule),
  };
}

/** The client with that id, `undefined` when it was deleted since import. */
export function findClient(clients: readonly Client[], clientId: string | null | undefined): Client | undefined {
  if (clientId === null || clientId === undefined) return undefined;
  return clients.find((client) => client.id === clientId);
}

/** Stable ordering: instant first, then id, then file and line for notes. */
export function sortEvidence(evidence: readonly Evidence[]): Evidence[] {
  return [...evidence].sort((a, b) => {
    const at = instantOf(a) - instantOf(b);
    if (at !== 0) return at;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    const file = (a.file ?? '').localeCompare(b.file ?? '');
    if (file !== 0) return file;
    return (a.line ?? 0) - (b.line ?? 0);
  });
}

function instantOf(item: Evidence): number {
  return item.at ?? item.start ?? 0;
}
