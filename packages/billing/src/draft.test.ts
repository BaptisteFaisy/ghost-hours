import { describe, expect, it } from 'vitest';
import { formatMoney } from '@ghost-hours/core';
import type { Block, InvoiceDraft } from '@ghost-hours/core';
import {
  ACME,
  ACME_MONTH_BLOCKS,
  GLOBEX,
  NOVEMBER_2026,
  PROJECT_API,
  PROJECT_PORTAL,
  SETTINGS,
  makeBlock,
} from './fixtures.ts';
import { buildInvoiceDraft, formatLineQuantity, lineQuantityValue, recalculateDraft } from './index.ts';

function acmeDraft(blocks: readonly Block[] = ACME_MONTH_BLOCKS): InvoiceDraft {
  return buildInvoiceDraft({ client: ACME, period: NOVEMBER_2026, blocks, settings: SETTINGS, taxRateBp: 2_000 });
}

const daysOf = (draft: InvoiceDraft): number =>
  draft.lines.reduce((sum, line) => sum + lineQuantityValue(line), 0);

function lineAt(draft: InvoiceDraft, index: number) {
  const line = draft.lines[index];
  if (!line) throw new Error(`no line at index ${index}`);
  return line;
}

describe('buildInvoiceDraft, daily modes (HEU-F-23, HEU-F-24)', () => {
  it('bills Acme 9.5 days for November, per project', () => {
    const draft = acmeDraft();
    expect(draft.lines).toHaveLength(2);
    expect(draft.lines.map((line) => line.projectId)).toEqual([PROJECT_API.id, PROJECT_PORTAL.id]);
    expect(daysOf(draft)).toBe(9.5);
    expect(draft.lines[0]?.amountCents).toBe(312_000);
    expect(draft.lines[1]?.amountCents).toBe(182_000);
    expect(formatLineQuantity(lineAt(draft, 0), 'en')).toBe('6.00 day');
    expect(formatLineQuantity(lineAt(draft, 1), 'fr')).toBe('3,50 day');
    expect(draft.lines[0]?.unitLabel).toBe('day');
    expect(draft.lines[0]?.unitPriceCents).toBe(52_000);
  });

  it('keeps the real minutes on a daily line for traceability', () => {
    const draft = acmeDraft();
    expect(draft.lines[0]?.quantityMinutes).toBe(5 * 420 + 240 + 180);
    expect(draft.lines[1]?.quantityMinutes).toBe(3 * 420 + 180);
    expect(draft.lines[0]?.evidenceCount).toBe(4);
  });

  it('adds up to a subtotal, a tax and a total in integer cents (HEU-P-09)', () => {
    const draft = acmeDraft();
    expect(draft.subtotalCents).toBe(494_000);
    expect(draft.taxRateBp).toBe(2_000);
    expect(draft.taxCents).toBe(98_800);
    expect(draft.totalCents).toBe(592_800);
    expect(formatMoney(draft.subtotalCents, 'EUR', 'en')).toContain('4,940');
    expect(formatMoney(draft.totalCents, 'EUR', 'en')).toContain('5,928');
  });

  it('says Draft and carries no invoice number (HEU-F-25)', () => {
    const draft = acmeDraft();
    expect(draft.draftLabel).toBe('Draft');
    expect(Object.keys(draft)).not.toContain('number');
    expect(Object.keys(draft)).not.toContain('invoiceNumber');
    expect(draft.roundingNote).toBe('Rounding: nearest 15 min, applied per day.');
    expect(draft.roundingRule).toEqual(ACME.rounding);
  });
});

describe('buildInvoiceDraft, which blocks may be billed', () => {
  it('only ever reads confirmed and locked blocks', () => {
    const withGhosts = [
      ...ACME_MONTH_BLOCKS,
      makeBlock({ id: 'ghost-proposed', dayKey: '2026-11-16', clock: '09:00', minutes: 420, clientId: ACME.id, projectId: PROJECT_API.id, status: 'proposed' }),
      makeBlock({ id: 'ghost-rejected', dayKey: '2026-11-17', clock: '09:00', minutes: 420, clientId: ACME.id, projectId: PROJECT_API.id, status: 'rejected' }),
      makeBlock({ id: 'ghost-conflict', dayKey: '2026-11-18', clock: '09:00', minutes: 420, clientId: ACME.id, projectId: PROJECT_API.id, status: 'conflict' }),
    ];
    expect(acmeDraft(withGhosts).totalCents).toBe(acmeDraft().totalCents);
  });

  it('bills locked blocks, they are the invoiced ones (HEU-F-29)', () => {
    const locked = ACME_MONTH_BLOCKS.map((block) => ({ ...block, status: 'locked' as const, locked: true }));
    expect(acmeDraft(locked).subtotalCents).toBe(494_000);
  });

  it('produces an empty draft when nothing is confirmed', () => {
    const ghost = makeBlock({ id: 'none', dayKey: '2026-11-02', clock: '09:00', minutes: 420, clientId: ACME.id, status: 'proposed' });
    const draft = acmeDraft([ghost]);
    expect(draft.lines).toEqual([]);
    expect(draft.subtotalCents).toBe(0);
    expect(draft.totalCents).toBe(0);
    expect(draft.draftLabel).toBe('Draft');
  });
});

describe('buildInvoiceDraft, lines and locales', () => {
  it('lists unassigned work on its own line, last', () => {
    const blocks = [
      ...ACME_MONTH_BLOCKS,
      makeBlock({ id: 'no-project', dayKey: '2026-11-16', clock: '09:00', minutes: 420, clientId: ACME.id, projectId: null }),
    ];
    const draft = acmeDraft(blocks);
    expect(draft.lines).toHaveLength(3);
    expect(draft.lines[2]?.projectId).toBeNull();
    expect(draft.lines[2]?.label).toBe('Unassigned');
    expect(daysOf(draft)).toBe(10.5);
  });

  it('speaks French when asked', () => {
    const draft = buildInvoiceDraft({
      client: ACME,
      period: NOVEMBER_2026,
      blocks: [makeBlock({ id: 'fr', dayKey: '2026-11-16', clock: '09:00', minutes: 420, clientId: ACME.id })],
      settings: SETTINGS,
      locale: 'fr',
    });
    expect(draft.lines[0]?.label).toBe('Non affecté');
    expect(draft.roundingNote).toContain('Arrondi');
  });
});

describe('buildInvoiceDraft, hourly mode and period edges', () => {
  it('bills hours per project in hourly mode', () => {
    const draft = buildInvoiceDraft({
      client: GLOBEX,
      period: NOVEMBER_2026,
      blocks: [
        makeBlock({ id: 'h1', dayKey: '2026-11-02', clock: '09:00', minutes: 300, clientId: GLOBEX.id, projectId: 'globex-etl' }),
        makeBlock({ id: 'h2', dayKey: '2026-11-03', clock: '09:00', minutes: 180, clientId: GLOBEX.id, projectId: 'globex-etl' }),
      ],
      settings: SETTINGS,
    });
    expect(draft.lines[0]?.quantityMinutes).toBe(480);
    expect(draft.lines[0]?.unitLabel).toBe('h');
    expect(draft.lines[0]?.amountCents).toBe(52_000);
    expect(draft.taxRateBp).toBe(0);
    expect(draft.totalCents).toBe(52_000);
  });

  it('clips a block that straddles the period', () => {
    const straddling = makeBlock({ id: 'straddle', dayKey: '2026-10-31', clock: '22:00', minutes: 240, clientId: GLOBEX.id, projectId: 'globex-etl' });
    const draft = buildInvoiceDraft({ client: GLOBEX, period: NOVEMBER_2026, blocks: [straddling], settings: SETTINGS });
    expect(draft.lines[0]?.quantityMinutes).toBe(120);
    expect(draft.lines[0]?.amountCents).toBe(13_000);
  });
});

describe('recalculateDraft (HEU-P-09)', () => {
  it('gives the same total from the same blocks', () => {
    const draft = acmeDraft();
    const again = recalculateDraft(draft, ACME_MONTH_BLOCKS, SETTINGS);
    expect(again.totalCents).toBe(draft.totalCents);
    expect(again.subtotalCents).toBe(draft.subtotalCents);
    expect(again.lines.map((line) => line.amountCents)).toEqual(draft.lines.map((line) => line.amountCents));
    expect(again.roundingNote).toBe(draft.roundingNote);
  });

  it('follows a block that was confirmed after the draft', () => {
    const draft = acmeDraft();
    const extra = makeBlock({ id: 'late-confirmation', dayKey: '2026-11-16', clock: '09:00', minutes: 420, clientId: ACME.id, projectId: PROJECT_API.id });
    const again = recalculateDraft(draft, [...ACME_MONTH_BLOCKS, extra], SETTINGS);
    expect(daysOf(again)).toBe(10.5);
    expect(again.subtotalCents).toBeGreaterThan(draft.subtotalCents);
  });

  it('recomputes an hourly draft from the unit price of its lines', () => {
    const blocks = [makeBlock({ id: 'h1', dayKey: '2026-11-02', clock: '09:00', minutes: 480, clientId: GLOBEX.id, projectId: 'globex-etl' })];
    const draft = buildInvoiceDraft({ client: GLOBEX, period: NOVEMBER_2026, blocks, settings: SETTINGS });
    const extra = makeBlock({ id: 'h2', dayKey: '2026-11-03', clock: '09:00', minutes: 60, clientId: GLOBEX.id, projectId: 'globex-etl' });
    const again = recalculateDraft(draft, [...blocks, extra], SETTINGS);
    expect(again.subtotalCents).toBe(58_500);
    expect(again.lines[0]?.quantityMinutes).toBe(540);
  });

  it('keeps an empty draft empty instead of inventing a rate', () => {
    const empty = buildInvoiceDraft({ client: GLOBEX, period: NOVEMBER_2026, blocks: [], settings: SETTINGS });
    const late = makeBlock({ id: 'late', dayKey: '2026-11-02', clock: '09:00', minutes: 60, clientId: GLOBEX.id });
    const again = recalculateDraft(empty, [late], SETTINGS);
    expect(again.totalCents).toBe(0);
    expect(again.subtotalCents).toBe(0);
  });
});
