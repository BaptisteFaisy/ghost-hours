import type { AnnexDay, InvoiceDraft, SupportedLocale } from '@ghost-hours/core';
import {
  DEFAULT_SETTINGS,
  addDaysInZone,
  formatDate,
  formatDayLabel,
  formatMoney,
  formatPercent,
} from '@ghost-hours/core';
import { labels } from './labels.ts';
import type { Labels } from './labels.ts';
import { formatLineQuantity } from './lines.ts';

/**
 * Printable HTML (HEU-F-27): the PDF is produced by the browser's own print
 * dialog, so this document must be self-sufficient — no script, no font, no
 * image, no stylesheet, no URL of any kind (HEU-N-01). Everything it needs is
 * in the file, and the page is styled for A4 the moment it is opened.
 */
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

const PRINT_CSS = [
  ':root{color-scheme:light}',
  'body{font-family:Georgia,serif;margin:0 auto;padding:24px;max-width:820px;color:#1b1b1b;line-height:1.45}',
  'h1{font-size:26px;margin:0 0 4px}',
  'h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;margin:24px 0 6px;color:#555}',
  '.badge{display:inline-block;border:2px solid #1b1b1b;padding:2px 12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}',
  '.muted{color:#666;font-size:13px}',
  'table{width:100%;border-collapse:collapse;font-size:14px;margin-top:8px}',
  'th,td{border-bottom:1px solid #d8d8d8;padding:6px 8px;text-align:left}',
  'th{background:#f4f4f4;font-size:12px;text-transform:uppercase;letter-spacing:.06em}',
  'td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}',
  'tfoot td{font-weight:700;border-top:2px solid #1b1b1b}',
  '.notes li{margin:2px 0}',
  '@page{size:A4;margin:16mm}',
  '@media print{body{padding:0;max-width:none}.no-print{display:none}}',
].join('\n');

function partySection(
  draft: InvoiceDraft,
  text: Labels,
  locale: SupportedLocale,
  timeZone: string,
): string {
  const last = addDaysInZone(draft.period.end, -1, timeZone);
  const period = `${formatDate(draft.period.start, timeZone, locale)} – ${formatDate(last, timeZone, locale)}`;
  return [
    '<section class="parties">',
    `<h2>${escapeHtml(text.billTo)}</h2>`,
    `<p><strong>${escapeHtml(draft.clientName)}</strong></p>`,
    `<p class="muted">${escapeHtml(text.period)}: ${escapeHtml(period)}</p>`,
    `<p class="muted">${escapeHtml(text.rounding)}: ${escapeHtml(draft.roundingNote)}</p>`,
    '</section>',
  ].join('\n');
}

function linesTable(draft: InvoiceDraft, text: Labels, locale: SupportedLocale): string {
  const head = [
    `<tr><th>${escapeHtml(text.project)}</th>`,
    `<th class="num">${escapeHtml(text.quantity)}</th>`,
    `<th class="num">${escapeHtml(text.unitPrice)}</th>`,
    `<th class="num">${escapeHtml(text.amount)}</th></tr>`,
  ].join('');
  const body = draft.lines.map((line) =>
    [
      '<tr>',
      `<td>${escapeHtml(line.label)}</td>`,
      `<td class="num">${escapeHtml(formatLineQuantity(line, locale))}</td>`,
      `<td class="num">${escapeHtml(formatMoney(line.unitPriceCents, draft.currency, locale))}</td>`,
      `<td class="num">${escapeHtml(formatMoney(line.amountCents, draft.currency, locale))}</td>`,
      '</tr>',
    ].join(''),
  );
  return [`<table class="lines"><thead>${head}</thead><tbody>`, ...body, '</tbody></table>'].join('\n');
}

function totalsTable(draft: InvoiceDraft, text: Labels, locale: SupportedLocale): string {
  const money = (cents: number): string => escapeHtml(formatMoney(cents, draft.currency, locale));
  return [
    '<table class="totals"><tbody>',
    `<tr><td>${escapeHtml(text.subtotal)}</td><td class="num">${money(draft.subtotalCents)}</td></tr>`,
    `<tr><td>${escapeHtml(text.taxRate)} ${escapeHtml(formatPercent(draft.taxRateBp, locale))}</td>`,
    `<td class="num">${money(draft.taxCents)}</td></tr>`,
    '</tbody><tfoot>',
    `<tr><td>${escapeHtml(text.total)}</td><td class="num">${money(draft.totalCents)}</td></tr>`,
    '</tfoot></table>',
  ].join('\n');
}

function notesSection(draft: InvoiceDraft, text: Labels): string {
  if (draft.freeTextNotes.length === 0) return '';
  const items = draft.freeTextNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join('');
  return [`<h2>${escapeHtml(text.notes)}</h2>`, `<ul class="notes">${items}</ul>`].join('\n');
}

function annexSection(
  annex: readonly AnnexDay[],
  text: Labels,
  locale: SupportedLocale,
): string {
  if (annex.length === 0) return '';
  const head = [
    `<tr><th>${escapeHtml(text.day)}</th>`,
    `<th class="num">${escapeHtml(text.hours)}</th>`,
    `<th class="num">${escapeHtml(text.commits)}</th>`,
    `<th>${escapeHtml(text.meetings)}</th></tr>`,
  ].join('');
  const rows = annex.map((day) =>
    [
      '<tr>',
      `<td>${escapeHtml(formatDayLabel(day.dayKey, locale))}</td>`,
      `<td class="num">${escapeHtml((day.minutes / 60).toFixed(1).replace('.', locale === 'fr' ? ',' : '.'))}</td>`,
      `<td class="num">${day.commitCount}</td>`,
      `<td>${escapeHtml(day.meetingTitles.join(', '))}</td>`,
      '</tr>',
    ].join(''),
  );
  return [
    `<h2>${escapeHtml(text.annexTitle)}</h2>`,
    `<table class="annex"><thead>${head}</thead><tbody>`,
    ...rows,
    '</tbody></table>',
  ].join('\n');
}

/**
 * Standalone printable document. `timeZone` is an additive fourth parameter:
 * a period is only a pair of instants, so rendering its first and last day
 * needs the zone the draft was built in (defaults to the app's own zone).
 */
export function draftToPrintHtml(
  draft: InvoiceDraft,
  annex: readonly AnnexDay[] = [],
  locale: SupportedLocale = 'en',
  timeZone: string = DEFAULT_SETTINGS.timeZone,
): string {
  const text = labels(locale);
  const title = `${text.draftTitle} — ${draft.clientName}`;
  return [
    '<!doctype html>',
    `<html lang="${escapeHtml(locale)}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${PRINT_CSS}</style>`,
    '</head>',
    '<body>',
    '<header>',
    `<h1>${escapeHtml(text.draftTitle)}</h1>`,
    `<p class="badge">${escapeHtml(draft.draftLabel)}</p>`,
    `<p class="muted">${escapeHtml(text.noNumber)}</p>`,
    '</header>',
    partySection(draft, text, locale, timeZone),
    linesTable(draft, text, locale),
    totalsTable(draft, text, locale),
    notesSection(draft, text),
    annexSection(annex, text, locale),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
