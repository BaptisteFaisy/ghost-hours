import { DEFAULT_ROUNDING, hashId, randomId, ruleId, slugify } from '@ghost-hours/core';
import type { Client, MappingRule, Project } from '@ghost-hours/core';
import type { MakeClientInput } from './types.ts';

/**
 * Immutable client factory (HEU-F-07).
 *
 * A client is a user-created entity, so its id is random (`randomId`);
 * project ids are derived from the project name, so the same name always
 * yields the same id and re-importing a dataset cannot fork a project.
 */
export function makeClient(input: MakeClientInput): Client {
  return {
    id: input.id ?? randomId('cli'),
    name: input.name.trim(),
    mode: input.mode ?? 'hourly',
    rateCents: input.rateCents ?? 0,
    dayRateCents: input.dayRateCents ?? 0,
    currency: input.currency ?? 'EUR',
    rounding: { ...(input.rounding ?? DEFAULT_ROUNDING) },
    projects: (input.projects ?? []).map((project) => makeProject(project.name, project.id)),
    rules: (input.rules ?? []).map((rule) => ({ ...rule })),
  };
}

/** `prj:<hash of the slug>` — deterministic, so a project name is its identity. */
export function makeProject(name: string, id?: string): Project {
  return { id: id ?? `prj:${hashId(slugify(name))}`, name: name.trim() };
}

/**
 * Add or replace a rule, without mutating anything (HEU-F-09).
 *
 * Dedupe is by rule id, so calling it twice with the same rule leaves the
 * list unchanged; an unknown `clientId` is a no-op.
 */
export function upsertRule(clients: readonly Client[], rule: MappingRule): Client[] {
  return clients.map((client) => {
    if (client.id !== rule.clientId) return client;
    const kept = client.rules.filter((existing) => existing.id !== rule.id);
    return { ...client, rules: [...kept, { ...rule }] };
  });
}

/** Remove a rule by id from every client; an absent id is a no-op. */
export function removeRule(clients: readonly Client[], ruleIdToRemove: string): Client[] {
  return clients.map((client) => {
    const kept = client.rules.filter((rule) => rule.id !== ruleIdToRemove);
    return kept.length === client.rules.length ? client : { ...client, rules: kept };
  });
}

/** The id `upsertRule` will give a rule for this client, type and value. */
export function ruleIdentity(clientId: string, type: MappingRule['type'], value: string): string {
  return ruleId(clientId, type, value);
}
