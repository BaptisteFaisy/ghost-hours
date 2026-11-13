import type { Evidence } from '@ghost-hours/core';

/**
 * Automation is not the freelancer's work.
 *
 * A dependency bot, a merge queue and a CI pipeline all commit to the same
 * repositories, several times a day. Counted as proof, they inflate the hours
 * — the one thing this product must never do. They are therefore set aside by
 * default, and **listed** in `ignoredEvidence`: a filter that hides what it
 * dropped is a filter nobody can audit.
 */

const BOT_EMAILS = [
  'dependabot',
  'renovate',
  'github-actions',
  'mergify',
  'greenkeeper',
  'snyk',
  'netlify',
  'vercel',
  'codecov',
  'sonar',
  'gitlab',
  'jenkins',
  'travis',
];

const BOT_MARKERS = ['[bot]', 'bot@', 'noreply@github.com', 'actions@github.com', 'ci@'];

/** Queue and tooling merge commits, whatever their author. */
const AUTOMATED_SUMMARIES = [
  /^merge pull request #\d+ from (dependabot|renovate|mergify)/i,
  /^merge branch 'mergify\//i,
  /^chore\(deps\)/i,
  /^build\(deps\)/i,
  /\[skip ci\]/i,
];

export function isAutomation(evidence: Evidence): boolean {
  const email = (evidence.authorEmail ?? evidence.organizerEmail ?? '').toLowerCase();
  const summary = evidence.summary ?? '';
  if (BOT_MARKERS.some((marker) => email.includes(marker))) return true;
  if (BOT_EMAILS.some((bot) => email.includes(bot))) return true;
  return AUTOMATED_SUMMARIES.some((pattern) => pattern.test(summary));
}

export interface NoiseSplit {
  readonly kept: readonly Evidence[];
  readonly ignored: readonly Evidence[];
}

/** Split evidence into what counts and what automation produced. */
export function partitionAutomation(evidence: readonly Evidence[]): NoiseSplit {
  const kept: Evidence[] = [];
  const ignored: Evidence[] = [];
  for (const item of evidence) {
    if (isAutomation(item)) ignored.push(item);
    else kept.push(item);
  }
  return { kept, ignored };
}
