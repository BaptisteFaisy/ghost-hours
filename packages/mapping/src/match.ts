import { slugify } from '@ghost-hours/core';
import type { Client, Evidence, MappingRule, Project } from '@ghost-hours/core';
import { DEFAULT_PRECEDENCE } from './types.ts';
import type { RulePrecedence } from './types.ts';
import { ruleMatches } from './rules.ts';

/** A rule and the client it belongs to: what `matchRuleFor` returns. */
export interface RuleMatch {
  readonly rule: MappingRule;
  readonly client: Client;
}

/**
 * The rule that claims this evidence, or `null` when it stays orphan.
 *
 * Priority is explicit and documented (`DEFAULT_PRECEDENCE`): the rule type
 * order decides first, then the order of `clients`, then the order of the
 * client's own `rules`. Nothing depends on object iteration order, so the
 * result is reproducible (HEU-F-16).
 */
export function matchRuleFor(
  evidence: Evidence,
  clients: readonly Client[],
  precedence: RulePrecedence = DEFAULT_PRECEDENCE,
): RuleMatch | null {
  for (const type of precedence) {
    for (const client of clients) {
      for (const rule of client.rules) {
        if (rule.type !== type || rule.clientId !== client.id) continue;
        if (ruleMatches(rule, evidence)) return { rule, client };
      }
    }
  }
  return null;
}

/**
 * Project for a piece of evidence: the rule's own project when it names one,
 * otherwise the client project whose name matches the repository
 * (`slugify` comparison), otherwise `null`.
 */
export function resolveProjectId(
  evidence: Evidence,
  client: Client,
  rule: MappingRule | null,
): string | null {
  if (rule?.projectId !== undefined && rule.projectId !== null) return rule.projectId;
  if (evidence.projectId !== undefined && evidence.projectId !== null) return evidence.projectId;
  return inferProjectId(evidence.repo, client);
}

/** Repository `acme-api` → project `Acme API` of the same client. */
export function inferProjectId(repo: string | undefined, client: Client): string | null {
  if (repo === undefined) return null;
  const wanted = slugify(repo);
  if (wanted.length === 0) return null;
  const match = client.projects.find((project: Project) => slugify(project.name) === wanted);
  return match?.id ?? null;
}
