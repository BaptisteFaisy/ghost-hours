import { describe, expect, it } from 'vitest';
import type { Client } from '@ghost-hours/core';
import { ACME, ACME_EVIDENCE, ACME_MONTH_BLOCKS, CLIENTS, NOVEMBER_2026, SETTINGS, makeBlock } from './fixtures.ts';
import {
  annexToCsv,
  buildAnnex,
  buildInvoiceDraft,
  draftToJson,
  draftToPrintHtml,
  timesheetCsv,
} from './index.ts';

const draft = buildInvoiceDraft({
  client: ACME,
  period: NOVEMBER_2026,
  blocks: ACME_MONTH_BLOCKS,
  settings: SETTINGS,
  taxRateBp: 2_000,
  freeTextNotes: ['Payment within 30 days.'],
});

describe('timesheetCsv (HEU-F-27)', () => {
  it('lists every billable block, one row each', () => {
    const csv = timesheetCsv(ACME_MONTH_BLOCKS, CLIENTS, SETTINGS, 'en');
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'Day,Start,End,Minutes,Hours,Client,Project,Confidence,Proven share,Evidence',
    );
    expect(lines).toHaveLength(1 + ACME_MONTH_BLOCKS.length);
    expect(lines[1]).toContain('Acme');
    expect(lines[1]).toContain('acme-api');
    expect(lines[1]).toContain('420');
  });

  it('escapes a client name that holds a comma', () => {
    const commaClient: Client = { ...ACME, name: 'Acme, Inc.' };
    const csv = timesheetCsv(ACME_MONTH_BLOCKS, [commaClient], SETTINGS, 'en');
    expect(csv).toContain('"Acme, Inc."');
  });

  it('leaves non-billable blocks out', () => {
    const ghost = makeBlock({
      id: 'ghost',
      dayKey: '2026-11-16',
      clock: '09:00',
      minutes: 420,
      clientId: ACME.id,
      status: 'proposed',
    });
    const csv = timesheetCsv([...ACME_MONTH_BLOCKS, ghost], CLIENTS, SETTINGS, 'en');
    expect(csv.split('\n')).toHaveLength(1 + ACME_MONTH_BLOCKS.length);
  });

  it('speaks French', () => {
    expect(timesheetCsv(ACME_MONTH_BLOCKS, CLIENTS, SETTINGS, 'fr').split('\n')[0]).toContain('Heures');
  });
});

describe('draftToJson (HEU-F-27)', () => {
  it('round-trips the draft', () => {
    expect(JSON.parse(draftToJson(draft))).toEqual(JSON.parse(JSON.stringify(draft)));
  });

  it('sorts keys so two exports are byte-identical', () => {
    const json = draftToJson(draft);
    expect(json).toBe(draftToJson(draft));
    expect(json.startsWith('{\n  "clientId"')).toBe(true);
    expect(json.indexOf('"amountCents"')).toBeLessThan(json.indexOf('"label"'));
    expect(json.endsWith('\n')).toBe(true);
  });

  it('keeps the line order, which carries meaning', () => {
    const parsed = JSON.parse(draftToJson(draft)) as { lines: { projectId: string | null }[] };
    expect(parsed.lines.map((line) => line.projectId)).toEqual(['acme-api', 'acme-portal']);
  });
});

describe('draftToPrintHtml (HEU-F-27, HEU-N-01)', () => {
  it('is a standalone document with the Draft mention', () => {
    const html = draftToPrintHtml(draft);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<p class="badge">Draft</p>');
    expect(html).toContain('No invoice number');
    expect(html).toContain('Acme');
    expect(html).toContain('acme-api');
  });

  it('carries no script, no remote URL and its own print stylesheet', () => {
    const html = draftToPrintHtml(draft);
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html.toLowerCase()).not.toContain('http://');
    expect(html.toLowerCase()).not.toContain('https://');
    expect(html).toContain('@media print');
    expect(html).toContain('@page');
  });

  it('prints the amounts, the rounding rule and the period', () => {
    const html = draftToPrintHtml(draft);
    expect(html).toContain('4,940.00');
    expect(html).toContain('5,928.00');
    expect(html).toContain('Rounding: nearest 15 min, applied per day.');
    expect(html).toContain('30 Nov 2026');
    expect(html).toContain('Payment within 30 days.');
  });

}); 

describe('draftToPrintHtml, content', () => {
  it('embeds the annex when one is given', () => {
    const annex = buildAnnex(ACME_MONTH_BLOCKS, ACME_EVIDENCE, SETTINGS, 'with-evidence', 'en');
    const html = draftToPrintHtml(draft, annex);
    expect(html).toContain('Evidence annex');
    expect(html).toContain('Weekly');
    expect(html).toContain('class="annex"');
    expect(annexToCsv(annex, 'en')).toContain('3960');
  });

  it('speaks French and keeps the Draft word visible', () => {
    const french = buildInvoiceDraft({
      client: ACME,
      period: NOVEMBER_2026,
      blocks: ACME_MONTH_BLOCKS,
      settings: SETTINGS,
      locale: 'fr',
    });
    const html = draftToPrintHtml(french, [], 'fr');
    expect(html).toContain('Facture en brouillon');
    expect(html).toContain('Draft');
    expect(html).toContain('lang="fr"');
  });

  it('escapes text that could break the markup', () => {
    const risky = buildInvoiceDraft({
      client: { ...ACME, name: '<Acme & Co>' },
      period: NOVEMBER_2026,
      blocks: ACME_MONTH_BLOCKS,
      settings: SETTINGS,
      freeTextNotes: ['Use <b>bold</b> sparingly & wisely'],
    });
    const html = draftToPrintHtml(risky);
    expect(html).toContain('&lt;Acme &amp; Co&gt;');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(html).not.toContain('<b>bold</b>');
  });
});
