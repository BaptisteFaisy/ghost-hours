import type {
  Block,
  Client,
  InvoiceDraft,
  ReconstructionSettings,
  SupportedLocale,
} from '@ghost-hours/core';
import { formatDate, formatHours, formatPercent, formatTime, toCsv } from '@ghost-hours/core';
import { billableBlocks, blockMinutes } from './blocks.ts';
import { labels } from './labels.ts';
import { stableStringify } from './stable-json.ts';

export { draftToPrintHtml } from './html.ts';

/**
 * Exports (HEU-F-27). Three formats, three jobs: a timesheet the client can
 * open in a spreadsheet, the draft data for a re-import, and a printable
 * document the browser turns into a PDF. All three are pure functions of the
 * draft — same input, same bytes (HEU-F-16).
 */
function projectNames(clients: readonly Client[]): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const client of clients) {
    for (const project of client.projects) names.set(`${client.id}:${project.id}`, project.name);
  }
  return names;
}

function projectLabel(block: Block, names: ReadonlyMap<string, string>, unassigned: string): string {
  if (block.projectId === null) return unassigned;
  return names.get(`${block.clientId}:${block.projectId}`) ?? block.projectId;
}

/** Timesheet: one row per billable block, ready for a spreadsheet (HEU-F-27). */
export function timesheetCsv(
  blocks: readonly Block[],
  clients: readonly Client[],
  settings: ReconstructionSettings,
  locale: SupportedLocale,
): string {
  const text = labels(locale);
  const names = new Map(clients.map((client) => [client.id, client.name]));
  const projects = projectNames(clients);
  const header: (string | number)[] = [
    text.day,
    text.start,
    text.end,
    text.minutes,
    text.hours,
    text.client,
    text.project,
    text.confidence,
    text.provenShare,
    text.evidence,
  ];
  const rows = billableBlocks(blocks).map((block) => {
    const minutes = blockMinutes(block);
    return [
      formatDate(block.start, settings.timeZone, locale),
      formatTime(block.start, settings.timeZone, locale),
      formatTime(block.end, settings.timeZone, locale),
      minutes,
      formatHours(minutes, locale),
      names.get(block.clientId) ?? block.clientId,
      projectLabel(block, projects, text.unassigned),
      block.confidence,
      formatPercent(Math.round(block.provenShare * 10_000), locale),
      block.evidenceIds.length,
    ];
  });
  return toCsv([header, ...rows]);
}

/** Draft data as stable JSON: sorted keys, so two runs are byte-identical. */
export function draftToJson(draft: InvoiceDraft): string {
  return stableStringify(draft);
}
