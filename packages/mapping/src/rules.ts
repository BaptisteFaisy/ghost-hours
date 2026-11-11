import { slugify } from '@ghost-hours/core';
import type { Evidence, MappingRule } from '@ghost-hours/core';

/**
 * Does one rule claim one evidence? (HEU-F-08)
 *
 * Every comparison is case insensitive and trimmed, and an empty rule value
 * never matches: a blank rule must not swallow the whole month.
 */
export function ruleMatches(rule: MappingRule, evidence: Evidence): boolean {
  const value = rule.value.trim();
  if (value.length === 0) return false;
  switch (rule.type) {
    case 'repo':
      return sameName(evidence.repo, value);
    case 'remote-contains':
      return containsText(evidence.remote, value);
    case 'attendee-domain':
      return attendeeDomains(evidence).includes(normalizeDomain(value));
    case 'title-contains':
      return containsText(evidence.title, value);
    case 'note-tag':
      return evidence.tag !== undefined && slugify(evidence.tag) === slugify(value);
    case 'manual':
      return evidence.id === value;
    default:
      return false;
  }
}

/** Case-insensitive equality of two names (repository, client, project). */
export function sameName(left: string | undefined, right: string | undefined): boolean {
  if (left === undefined || right === undefined) return false;
  return lower(left) === lower(right);
}

/** Case-insensitive substring test. */
export function containsText(haystack: string | undefined, needle: string): boolean {
  if (haystack === undefined) return false;
  return lower(haystack).includes(lower(needle));
}

/** Domain part of an e-mail address, lowercased; `''` when malformed. */
export function emailDomain(email: string | undefined): string {
  if (email === undefined) return '';
  const at = email.lastIndexOf('@');
  if (at < 0) return '';
  return normalizeDomain(email.slice(at + 1));
}

/** Every domain a meeting touches: attendees first, then the organizer. */
export function attendeeDomains(evidence: Evidence): readonly string[] {
  const domains: string[] = [];
  for (const attendee of evidence.attendees ?? []) {
    const domain = emailDomain(attendee.email);
    if (domain.length > 0 && !domains.includes(domain)) domains.push(domain);
  }
  const organizer = emailDomain(evidence.organizerEmail);
  if (organizer.length > 0 && !domains.includes(organizer)) domains.push(organizer);
  return domains;
}

/** `@acme.example.org` and `ACME.example.org` are the same domain. */
export function normalizeDomain(value: string): string {
  return lower(value).replace(/^@/, '');
}

function lower(value: string): string {
  return value.trim().toLowerCase();
}
