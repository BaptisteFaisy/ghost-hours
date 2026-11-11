import type {
  AnnexDay,
  AnnexDetail,
  Block,
  Evidence,
  ReconstructionSettings,
  SupportedLocale,
} from '@ghost-hours/core';
import { formatDayLabel, formatHours, localeTag, toCsv } from '@ghost-hours/core';
import { billableBlocks, groupByDay, sumMinutes, uniqueEvidenceIds } from './blocks.ts';
import { labels } from './labels.ts';

/**
 * The evidence annex (HEU-F-26): one row per day, at the detail level the user
 * picked. `durations` keeps the document sober; `with-evidence` adds the commit
 * count and the meeting titles so a client can trace every hour back.
 *
 * The annex only ever describes billable blocks — an annex that mentioned a
 * proposed block would advertise minutes the invoice does not charge.
 */
function evidenceOf(day: readonly Block[], byId: ReadonlyMap<string, Evidence>): readonly Evidence[] {
  return uniqueEvidenceIds(day)
    .map((id) => byId.get(id))
    .filter((item): item is Evidence => item !== undefined);
}

function meetingTitles(items: readonly Evidence[], collator: Intl.Collator): readonly string[] {
  const titles = new Set<string>();
  for (const item of items) {
    if (item.kind !== 'meeting') continue;
    const title = (item.title ?? '').trim();
    if (title.length > 0) titles.add(title);
  }
  return [...titles].sort((a, b) => collator.compare(a, b));
}

export function buildAnnex(
  blocks: readonly Block[],
  evidence: readonly Evidence[],
  settings: ReconstructionSettings,
  detail: AnnexDetail,
  locale: SupportedLocale,
): readonly AnnexDay[] {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  const collator = new Intl.Collator(localeTag(locale));
  const withEvidence = detail === 'with-evidence';
  return groupByDay(billableBlocks(blocks), settings).map((day) => {
    const items = evidenceOf(day.blocks, byId);
    return {
      dayKey: day.dayKey,
      minutes: sumMinutes(day.blocks),
      commitCount: withEvidence ? items.filter((item) => item.kind === 'commit').length : 0,
      meetingTitles: withEvidence ? meetingTitles(items, collator) : [],
    };
  });
}

export function annexToCsv(annex: readonly AnnexDay[], locale: SupportedLocale): string {
  const text = labels(locale);
  const rows: (string | number)[][] = [[text.day, text.minutes, text.hours, text.commits, text.meetings]];
  for (const day of annex) {
    rows.push([
      formatDayLabel(day.dayKey, locale),
      day.minutes,
      formatHours(day.minutes, locale),
      day.commitCount,
      day.meetingTitles.join(' | '),
    ]);
  }
  const totalMinutes = annex.reduce((sum, day) => sum + day.minutes, 0);
  const totalCommits = annex.reduce((sum, day) => sum + day.commitCount, 0);
  rows.push([text.totalRow, totalMinutes, formatHours(totalMinutes, locale), totalCommits, '']);
  return toCsv(rows);
}
