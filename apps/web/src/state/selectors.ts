import { addDaysInZone, msToWholeMinutes, monthRangeInZone, parseDayKey, weekDaysInZone, zonedTimeToInstant } from '@ghost-hours/core';
import type {
  AnnexDay,
  Block,
  Cents,
  Client,
  Conflict,
  DayRange,
  Evidence,
  Instant,
  InvoiceDraft,
  Minutes,
  MonthCounter,
  Period,
} from '@ghost-hours/core';
import { buildAnnex, buildInvoiceDraft, detectOverloadedDays, roundCents } from '@ghost-hours/billing';
import type { OverloadWarning } from '@ghost-hours/billing';
import type { AppState } from './types.ts';

/**
 * The derived views of the store (contract 3).
 *
 * Every selector is a pure function of the state: no clock, no randomness,
 * no hidden state. The month comes from `state.activeMonth`, so the counter
 * always describes the month the user is looking at.
 */

/** Blocks that count as real work: proposed, confirmed or invoiced. */
function isCounted(block: Block): boolean {
  return block.status !== 'rejected' && block.status !== 'conflict';
}

function overlaps(block: Block, period: Period): boolean {
  return block.start < period.end && block.end > period.start;
}

function minutesOf(block: Block): Minutes {
  return msToWholeMinutes(block.end - block.start);
}

function monthPeriod(state: AppState): Period {
  const range = monthRangeInZone(state.activeMonth.year, state.activeMonth.month, state.settings.timeZone);
  return { start: range.start, end: range.end };
}

function blocksOfMonth(state: AppState): readonly Block[] {
  const period = monthPeriod(state);
  return state.blocks
    .filter((block) => overlaps(block, period))
    .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
}

function sumMinutes(blocks: readonly Block[]): Minutes {
  return blocks.reduce((total, block) => total + minutesOf(block), 0);
}

/** The declared minutes of a client; `null` when the user declared nothing. */
function declaredOf(state: AppState, clientId: string): Minutes | null {
  const value = state.declaredMinutes[clientId];
  return value === undefined ? null : value;
}

/** The amount of ghost minutes for one client, in cents. */
function ghostAmountCents(
  client: Client | null,
  ghostMinutes: Minutes,
  dayLengthMinutes: Minutes,
): Cents | null {
  if (client === null) return null;
  if (client.mode === 'hourly') return roundCents((ghostMinutes * client.rateCents) / 60);
  const dayLength = dayLengthMinutes > 0 ? dayLengthMinutes : 1;
  return roundCents((client.dayRateCents * ghostMinutes) / dayLength);
}

function counterRow(state: AppState, client: Client | null, blocks: readonly Block[]): MonthCounter {
  const found = sumMinutes(blocks.filter(isCounted));
  const confirmed = sumMinutes(
    blocks.filter((block) => block.status === 'confirmed' || block.status === 'locked'),
  );
  const declared = client === null ? null : declaredOf(state, client.id);
  const ghost = declared === null ? null : found - declared;
  return {
    clientId: client?.id ?? null,
    period: monthPeriod(state),
    foundMinutes: found,
    confirmedMinutes: confirmed,
    declaredMinutes: declared,
    ghostMinutes: ghost,
    ghostAmountCents:
      ghost === null ? null : ghostAmountCents(client, ghost, state.settings.dayLengthMinutes),
  };
}

/**
 * One row per client, plus the 'all' row (`clientId: null`) that sums them.
 *
 * The found minutes are the real blocks of the month — rejected and
 * conflicting blocks never count. The confirmed minutes are the ones the
 * user signed off. The ghost minutes are what was found but not declared.
 */
export function monthCounter(state: AppState): readonly MonthCounter[] {
  const blocks = blocksOfMonth(state);
  const clients = [...state.clients].sort((left, right) => left.name.localeCompare(right.name));
  const rows = clients.map((client) =>
    counterRow(state, client, blocks.filter((block) => block.clientId === client.id)),
  );
  const declaredValues = clients.map((client) => declaredOf(state, client.id));
  const declared =
    clients.length === 0 || declaredValues.some((value) => value === null)
      ? null
      : declaredValues.reduce<number>((total, value) => total + (value ?? 0), 0);
  const all = counterRow(state, null, blocks);
  const allAmount = rows.reduce<Cents>((total, row) => total + (row.ghostAmountCents ?? 0), 0);
  return [
    ...rows,
    {
      ...all,
      declaredMinutes: declared,
      ghostMinutes: declared === null ? null : all.foundMinutes - declared,
      ghostAmountCents: declared === null ? null : allAmount,
    },
  ];
}

/** The blocks of a week, sorted by start time. */
export function weekBlocks(state: AppState, weekStart: Instant): readonly Block[] {
  const period = weekPeriod(state, weekStart);
  return state.blocks
    .filter((block) => overlaps(block, period))
    .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
}

/** The blocks of a single day. */
export function dayBlocks(state: AppState, dayKey: string): readonly Block[] {
  const day = dayPeriod(state, dayKey);
  if (day === null) return [];
  return state.blocks
    .filter((block) => overlaps(block, day))
    .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
}

/** The seven days of a week, from Monday to Sunday. */
export function weekDays(state: AppState, weekStart: Instant): readonly DayRange[] {
  return weekDaysInZone(weekStart, state.settings.timeZone);
}

/** The proofs a block rests on. */
export function evidenceOfBlock(state: AppState, blockId: string): readonly Evidence[] {
  const block = blockById(state, blockId);
  if (block === null) return [];
  const wanted = new Set(block.evidenceIds);
  return state.evidence.filter((item) => wanted.has(item.id));
}

/** The conflicts of a week. */
export function conflictsOfWeek(state: AppState, weekStart: Instant): readonly Conflict[] {
  const period = weekPeriod(state, weekStart);
  return state.conflicts
    .filter((conflict) => conflict.start < period.end && conflict.end > period.start)
    .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
}

/** The invoice draft of a client for the active month. */
export function draftFor(state: AppState, clientId: string): InvoiceDraft {
  const client = clientById(state, clientId) ?? emptyClient(clientId);
  return buildInvoiceDraft({
    client,
    period: monthPeriod(state),
    blocks: state.blocks,
    settings: state.settings,
    taxRateBp: state.taxRateBp,
    freeTextNotes: state.freeTextNotes,
    locale: state.locale,
  });
}

/** The evidence annex of a client for the active month. */
export function annexFor(state: AppState, clientId: string): readonly AnnexDay[] {
  const period = monthPeriod(state);
  const blocks = state.blocks.filter((block) => block.clientId === clientId && overlaps(block, period));
  return buildAnnex(blocks, state.evidence, state.settings, state.annexDetail, state.locale);
}

/** A block by its id. */
export function blockById(state: AppState, blockId: string): Block | null {
  return state.blocks.find((block) => block.id === blockId) ?? null;
}

/** A client by its id. */
export function clientById(state: AppState, clientId: string): Client | null {
  return state.clients.find((client) => client.id === clientId) ?? null;
}

function weekPeriod(state: AppState, weekStart: Instant): Period {
  const days = weekDaysInZone(weekStart, state.settings.timeZone);
  const start = days[0]?.start ?? weekStart;
  const end = days[days.length - 1]?.end ?? weekStart;
  return { start, end };
}

function dayPeriod(state: AppState, dayKey: string): Period | null {
  const { year, month, day } = parseDayKey(dayKey);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const start = zonedTimeToInstant({ year, month, day }, state.settings.timeZone);
  return { start, end: addDaysInZone(start, 1, state.settings.timeZone) };
}

function emptyClient(clientId: string): Client {
  return {
    id: clientId,
    name: clientId,
    mode: 'hourly',
    rateCents: 0,
    dayRateCents: 0,
    currency: 'EUR',
    rounding: { mode: 'nearest', stepMinutes: 15, scope: 'day' },
    projects: [],
    rules: [],
  };
}

/**
 * Days that carry more counted time than one working day, every client
 * together (`detectOverloadedDays`, D.6). The daily cap already keeps one
 * client from being billed twice for the same day; this is the other risk —
 * the same hours claimed by two clients, or a machine that never stopped.
 * Counted means neither `conflict` nor `rejected`: what a reviewer would bill.
 */
export function overloadedDays(state: AppState): readonly OverloadWarning[] {
  const counted = state.blocks.filter(
    (block) => block.status !== 'conflict' && block.status !== 'rejected',
  );
  return detectOverloadedDays(counted, state.settings);
}
