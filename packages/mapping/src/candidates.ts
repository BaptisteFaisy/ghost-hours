import type { Client, Evidence } from '@ghost-hours/core';
import type { SuggestedCandidate } from './types.ts';
import { attendeeDomains } from './rules.ts';
import { remoteFragment, slugOf } from './suggest.ts';

interface Signal {
  readonly reason: string;
  readonly confidence: number;
}

/**
 * Heuristic candidates for an orphan evidence (HEU-F-09).
 *
 * No model, no network: only name comparisons between what the evidence
 * carries (repository, remote, tag, title, attendee domain) and what the
 * clients declare (name, projects). Every candidate carries the sentence
 * that explains its score, so the UI never shows an unexplained guess.
 * The result is sorted by confidence, then by client id (HEU-F-16).
 */
export function suggestCandidates(evidence: Evidence, clients: readonly Client[]): readonly SuggestedCandidate[] {
  const candidates: SuggestedCandidate[] = [];
  for (const client of clients) {
    const signal = strongest(evidence, client);
    if (signal === null) continue;
    candidates.push({ clientId: client.id, reason: signal.reason, confidence: signal.confidence });
  }
  return candidates.sort((a, b) => b.confidence - a.confidence || (a.clientId < b.clientId ? -1 : 1));
}

/** The best signal for one client, or `null` when nothing points at it. */
function strongest(evidence: Evidence, client: Client): Signal | null {
  const signals = [
    tagSignal(evidence, client),
    repoSignal(evidence, client),
    remoteSignal(evidence, client),
    domainSignal(evidence, client),
    titleSignal(evidence, client),
  ].filter((signal): signal is Signal => signal !== null);
  if (signals.length === 0) return null;
  return signals.reduce((best, current) => (current.confidence > best.confidence ? current : best));
}

function tagSignal(evidence: Evidence, client: Client): Signal | null {
  const tag = slugOf(evidence.tag);
  if (tag.length === 0) return null;
  if (tag === slugOf(client.name)) return { reason: `note tag #${evidence.tag} matches the client name`, confidence: 0.9 };
  if (client.projects.some((project) => slugOf(project.name) === tag)) {
    return { reason: `note tag #${evidence.tag} matches a project of ${client.name}`, confidence: 0.75 };
  }
  return null;
}

function repoSignal(evidence: Evidence, client: Client): Signal | null {
  const repo = slugOf(evidence.repo);
  if (repo.length === 0) return null;
  const project = client.projects.find((item) => slugOf(item.name) === repo);
  if (project !== undefined) return { reason: `repository ${evidence.repo} is the project ${project.name}`, confidence: 0.85 };
  const name = slugOf(client.name);
  if (name.length > 0 && repo === name) return { reason: `repository ${evidence.repo} is named after the client`, confidence: 0.8 };
  if (name.length >= 3 && repo.includes(name)) return { reason: `repository ${evidence.repo} contains the client name`, confidence: 0.6 };
  return null;
}

function remoteSignal(evidence: Evidence, client: Client): Signal | null {
  const fragment = slugOf(remoteFragment(evidence.remote));
  const name = slugOf(client.name);
  if (fragment.length === 0 || name.length < 3) return null;
  if (!fragment.includes(name)) return null;
  return { reason: `remote ${evidence.remote ?? ''} contains the client name`, confidence: 0.55 };
}

function domainSignal(evidence: Evidence, client: Client): Signal | null {
  const name = slugOf(client.name);
  if (name.length < 3) return null;
  const domain = attendeeDomains(evidence).find((item) => item.includes(name));
  if (domain === undefined) return null;
  return { reason: `attendee domain ${domain} contains the client name`, confidence: 0.6 };
}

function titleSignal(evidence: Evidence, client: Client): Signal | null {
  const title = (evidence.title ?? '').toLowerCase();
  if (title.length === 0) return null;
  const words = client.name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 3);
  const hit = words.find((word) => title.includes(word));
  if (hit === undefined) return null;
  return { reason: `meeting title mentions "${hit}"`, confidence: 0.5 };
}
