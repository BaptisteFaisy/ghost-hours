import { ruleId, slugify } from '@ghost-hours/core';
import type { Evidence, MappingRule, RuleType } from '@ghost-hours/core';
import { DEFAULT_PRECEDENCE } from './types.ts';
import { attendeeDomains, emailDomain } from './rules.ts';

/**
 * The rule that would claim this evidence, in one gesture (HEU-F-09).
 *
 * The type is chosen from what the evidence actually carries, in the same
 * order as `DEFAULT_PRECEDENCE`, so the rule the user accepts behaves like
 * the rules written by hand. `manual` is the fallback: it always works, but
 * it claims exactly one evidence id.
 */
export function suggestRule(evidence: Evidence, clientId: string, projectId?: string | null): MappingRule {
  const picked = pick(evidence);
  return {
    id: ruleId(clientId, picked.type, picked.value),
    clientId,
    type: picked.type,
    value: picked.value,
    projectId: projectId ?? null,
  };
}

interface Picked {
  readonly type: RuleType;
  readonly value: string;
}

function pick(evidence: Evidence): Picked {
  for (const type of DEFAULT_PRECEDENCE) {
    const value = valueFor(type, evidence);
    if (value !== undefined) return { type, value };
  }
  return { type: 'manual', value: evidence.id };
}

function valueFor(type: RuleType, evidence: Evidence): string | undefined {
  switch (type) {
    case 'repo':
      return nonEmpty(evidence.repo);
    case 'remote-contains':
      return remoteFragment(evidence.remote);
    case 'attendee-domain':
      return attendeeDomains(evidence)[0] ?? nonEmpty(emailDomain(evidence.organizerEmail));
    case 'title-contains':
      return titleFragment(evidence.title);
    case 'note-tag':
      return nonEmpty(evidence.tag);
    case 'manual':
      return undefined;
    default:
      return undefined;
  }
}

/**
 * `example.com/acme/api` → `acme/api`: the part shared by every clone of
 * that repository, without the host that may move.
 */
export function remoteFragment(remote: string | undefined): string | undefined {
  const trimmed = nonEmpty(remote);
  if (trimmed === undefined) return undefined;
  const withoutScheme = trimmed.replace(/^[a-z+]+:\/\//i, '').replace(/\.git$/, '');
  const slash = withoutScheme.indexOf('/');
  const path = slash < 0 ? '' : withoutScheme.slice(slash + 1).replace(/\/+$/, '');
  return path.length > 0 ? path : withoutScheme;
}

/**
 * A fragment of the meeting title that generalizes: the longest word when
 * there is one, otherwise the whole title. `Weekly review Acme` → `Weekly`.
 */
export function titleFragment(title: string | undefined): string | undefined {
  const trimmed = nonEmpty(title);
  if (trimmed === undefined) return undefined;
  const words = trimmed
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 4)
    .sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  return words[0] ?? trimmed;
}

/** Slug form of a value, used when comparing names across sources. */
export function slugOf(value: string | undefined): string {
  return value === undefined ? '' : slugify(value);
}

function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
