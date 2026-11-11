import { fnv1a, toCsv } from '@ghost-hours/core';
import type { SupportedLocale } from '@ghost-hours/core';

/**
 * The local audit trail (idea C-06).
 *
 * Every decision the user makes is written down, in this browser, with a
 * chained fingerprint: each entry hashes the previous one, so a line edited or
 * removed afterwards breaks the chain. That is what makes the draft defensible
 * — "I confirmed this block on that day" is a statement with a trace — without
 * ever sending anything anywhere.
 */

export interface AuditEntry {
  readonly id: string;
  /** Epoch milliseconds, from the local clock at decision time. */
  readonly at: number;
  /** The action type, verbatim (`confirmBlock`, `adjustBlock`, …). */
  readonly action: string;
  readonly blockId?: string;
  readonly clientId?: string;
  /** Short human detail, already localised-free: ids, minutes, day keys. */
  readonly detail?: string;
  /** FNV-1a of this entry chained with the previous fingerprint. */
  readonly fingerprint: string;
}

const GENESIS = '0';

/** The fields that take part in the fingerprint (the id does not). */
export interface AuditFields {
  readonly at: number;
  readonly action: string;
  readonly blockId?: string;
  readonly clientId?: string;
  readonly detail?: string;
}

export function fingerprintOf(entry: AuditFields, previous: string): string {
  return fnv1a(`${previous}|${entry.at}|${entry.action}|${entry.blockId ?? ''}|${entry.clientId ?? ''}|${entry.detail ?? ''}`).toString(36);
}

export function appendAudit(entries: readonly AuditEntry[], entry: AuditFields): readonly AuditEntry[] {
  const previous = entries[entries.length - 1]?.fingerprint ?? GENESIS;
  const fingerprint = fingerprintOf(entry, previous);
  return [...entries, { ...entry, fingerprint, id: `${entries.length + 1}:${fingerprint}` }];
}

/** True when every link still holds; a tampered log breaks somewhere. */
export function verifyAudit(entries: readonly AuditEntry[]): { ok: boolean; brokenAt: number | null } {
  let previous = GENESIS;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) continue;
    const expected = fingerprintOf(entry, previous);
    if (expected !== entry.fingerprint) return { ok: false, brokenAt: index };
    previous = entry.fingerprint;
  }
  return { ok: true, brokenAt: null };
}

export function auditToCsv(entries: readonly AuditEntry[], locale: SupportedLocale = 'en'): string {
  const head = locale === 'fr'
    ? ['horodatage', 'action', 'bloc', 'client', 'detail', 'empreinte']
    : ['timestamp', 'action', 'block', 'client', 'detail', 'fingerprint'];
  const rows = entries.map((entry) => [
    new Date(entry.at).toISOString(),
    entry.action,
    entry.blockId ?? '',
    entry.clientId ?? '',
    entry.detail ?? '',
    entry.fingerprint,
  ]);
  return toCsv([head, ...rows]);
}

export function auditToJson(entries: readonly AuditEntry[]): string {
  return `${JSON.stringify({ version: 1, entries, check: verifyAudit(entries) }, null, 2)}\n`;
}

/** Which actions are decisions worth a trace (view changes are not). */
export const AUDITED_ACTIONS: ReadonlySet<string> = new Set([
  'loadSampleMonth',
  'importEvidence',
  'importCalendar',
  'importNotes',
  'importDataset',
  'addManualBlock',
  'confirmBlock',
  'rejectBlock',
  'adjustBlock',
  'splitBlock',
  'changeClient',
  'resolveConflict',
  'splitConflict',
  'confirmDay',
  'confirmWeek',
  'confirmSolidBlocks',
  'upsertClient',
  'upsertRule',
  'removeRule',
  'setSettings',
  'markPeriodInvoiced',
  'resetAll',
]);

/** One line of detail per action, in plain ids and numbers (never user text). */
export function describeAction(action: Readonly<Record<string, unknown>>): string | undefined {
  const parts: string[] = [];
  for (const key of ['blockId', 'clientId', 'conflictId', 'dayKey', 'keepBlockId', 'start', 'end', 'at'] as const) {
    const value = action[key];
    if (typeof value === 'string' || typeof value === 'number') parts.push(`${key}=${value}`);
  }
  return parts.length === 0 ? undefined : parts.join(' ');
}
