import { z } from 'zod';
import { evidenceItemSchema, normalizeItem, parseDataset } from '@ghost-hours/core';
import type { Dataset, Evidence } from '@ghost-hours/core';
import type { AuditEntry } from './audit.ts';
import { err, ok } from '@ghost-hours/core';
import type { ParseResult } from '@ghost-hours/core';

/**
 * Persistence (HEU-N-01): everything stays in this browser.
 *
 * IndexedDB without a library, with a `localStorage` fallback for the
 * browsers (and the test environments) that do not provide it. The payload is
 * versioned and validated before it is trusted: a dataset that fails
 * validation is reported, never half-loaded.
 *
 * No function here throws: a failed write returns its errors, so the UI can
 * report them in the import report instead of losing the user's work.
 */

export const PERSISTED_VERSION = 1;

const DB_NAME = 'ghost-hours';
const DB_STORE = 'state';
const DB_KEY = 'current';
const LS_KEY = 'ghost-hours:state';

const correctionsSchema = z.object({
  blockId: z.string().min(1),
  appliedMinutes: z.number(),
  acceptedMinutes: z.number(),
});

const auditEntrySchema = z.object({
  id: z.string(),
  at: z.number().int(),
  action: z.string(),
  blockId: z.string().optional(),
  clientId: z.string().optional(),
  detail: z.string().optional(),
  fingerprint: z.string(),
});

const envelopeSchema = z.object({
  version: z.literal(PERSISTED_VERSION),
  dataset: z.unknown(),
  evidence: z.array(evidenceItemSchema),
  corrections: z.array(correctionsSchema),
  taxRateBp: z.number().int().nonnegative(),
  freeTextNotes: z.array(z.string()),
  annexDetail: z.enum(['durations', 'with-evidence']),
  activeMonth: z.object({ year: z.number().int(), month: z.number().int() }),
  activeWeekStart: z.number().int().nullable(),
  // Optional: a state saved before the audit trail existed still loads.
  audit: z.array(auditEntrySchema).optional(),
});

export interface PersistedState {
  readonly dataset: Dataset;
  readonly evidence: readonly Evidence[];
  readonly corrections: readonly { readonly blockId: string; readonly appliedMinutes: number; readonly acceptedMinutes: number }[];
  readonly taxRateBp: number;
  readonly freeTextNotes: readonly string[];
  readonly annexDetail: 'durations' | 'with-evidence';
  readonly activeMonth: { readonly year: number; readonly month: number };
  readonly activeWeekStart: number | null;
  readonly audit?: readonly AuditEntry[];
}

function indexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

/** Open (and create) the local database. Rejects when IndexedDB is unusable. */
export function openDb(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, PERSISTED_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB.open failed'));
    request.onblocked = () => reject(new Error('indexedDB.open blocked'));
  });
}

function readDb(): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    void openDb().then((db) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const request = tx.objectStore(DB_STORE).get(DB_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error('indexedDB.get failed'));
      tx.oncomplete = () => db.close();
    }, reject);
  });
}

function writeDb(value: unknown): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    void openDb().then((db) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, DB_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('indexedDB.put failed'));
      };
    }, reject);
  });
}

function deleteDb(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    void openDb().then((db) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(DB_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('indexedDB.delete failed'));
      };
    }, reject);
  });
}

/**
 * One accessor for the fallback store: in private browsing Safari (and some
 * Firefoxes) `localStorage` reads and writes throw, so every call goes through
 * a probe that returns `null` instead of letting the exception out. The module
 * then answers `'memory'` and the interface warns that nothing will survive the
 * tab.
 */

export type StorageKind = 'indexeddb' | 'localstorage' | 'memory';

let detected: StorageKind | null = null;

function localStorageOrNull(): Storage | null {
  try {
    const ls = globalThis.localStorage;
    const probe = '__ghost_hours_probe__';
    ls?.setItem(probe, '1');
    ls?.removeItem(probe);
    return ls ?? null;
  } catch {
    return null;
  }
}

/** Which store the app will actually use, once the first probe has run. */
export function storageKind(): StorageKind {
  if (detected !== null) return detected;
  return indexedDbAvailable() ? 'indexeddb' : localStorageOrNull() !== null ? 'localstorage' : 'memory';
}

function readLocal(): unknown {
  const ls = localStorageOrNull();
  if (ls === null) return null;
  const raw = ls.getItem(LS_KEY);
  if (raw === null) return null;
  return JSON.parse(raw) as unknown;
}

function writeLocal(value: unknown): boolean {
  const ls = localStorageOrNull();
  if (ls === null) return false;
  ls.setItem(LS_KEY, JSON.stringify(value));
  return true;
}

function clearLocal(): boolean {
  const ls = localStorageOrNull();
  if (ls === null) return false;
  ls.removeItem(LS_KEY);
  return true;
}

/** Read the raw payload, from IndexedDB when possible, from localStorage otherwise. */
async function readRaw(): Promise<unknown> {
  if (!indexedDbAvailable()) return readLocal();
  try {
    return await readDb();
  } catch {
    return readLocal();
  }
}

async function writeRaw(value: unknown): Promise<string[]> {
  if (!indexedDbAvailable()) {
    detected = 'localstorage';
    if (writeLocal(value)) {
      detected = 'localstorage';
      return [];
    }
    detected = 'memory';
    return [notWritableMessage()];
  }
  let failedIdb: string | null = null;
  try {
    await writeDb(value);
    detected = 'indexeddb';
    return [];
  } catch (error) {
    failedIdb = messageOf(error);
  }
  // Fall back rather than lose the user's work.
  if (writeLocal(value)) {
    detected = 'localstorage';
    return [];
  }
  detected = 'memory';
  return [failedIdb ?? 'indexeddb write failed', notWritableMessage()];
}

function notWritableMessage(): string {
  return 'no persistent storage is writable in this browser (private mode?) — data lives in memory for this session';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Validate the raw payload: a broken one is reported, never half-loaded. */
export function parsePersisted(input: unknown): ParseResult<PersistedState> {
  const parsed = envelopeSchema.safeParse(input);
  if (!parsed.success) {
    return err(...parsed.error.issues.slice(0, 10).map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  const value = parsed.data;
  const dataset = parseDataset(value.dataset);
  if (!dataset.ok) return err(...dataset.errors);
  return ok({
    dataset: dataset.value,
    evidence: value.evidence.map((item) => normalizeItem(item)),
    corrections: value.corrections.map((item) => ({ ...item })),
    taxRateBp: value.taxRateBp,
    freeTextNotes: [...value.freeTextNotes],
    annexDetail: value.annexDetail,
    activeMonth: { ...value.activeMonth },
    activeWeekStart: value.activeWeekStart,
    audit: value.audit ?? [],
  });
}

/** Why a load failed: the store could not be read, or what it held was invalid. */
export type LoadFailureKind = 'read' | 'parse';

export type LoadResult =
  | { readonly ok: true; readonly value: PersistedState | null }
  | { readonly ok: false; readonly kind: LoadFailureKind; readonly errors: readonly string[] };

/** Load the persisted state; `null` when nothing was stored yet. */
export async function loadState(): Promise<LoadResult> {
  let raw: unknown;
  try {
    raw = await readRaw();
  } catch (error) {
    return { ok: false, kind: 'read', errors: [messageOf(error)] };
  }
  if (raw === null || raw === undefined) return ok(null);
  const parsed = parsePersisted(raw);
  if (!parsed.ok) return { ok: false, kind: 'parse', errors: parsed.errors };
  return ok(parsed.value);
}

/** Save the state; the returned errors are empty when the write succeeded. */
export async function saveState(state: PersistedState): Promise<ParseResult<null>> {
  const payload = {
    version: PERSISTED_VERSION,
    dataset: state.dataset,
    evidence: state.evidence,
    corrections: state.corrections,
    taxRateBp: state.taxRateBp,
    freeTextNotes: state.freeTextNotes,
    annexDetail: state.annexDetail,
    activeMonth: state.activeMonth,
    activeWeekStart: state.activeWeekStart,
    audit: state.audit ?? [],
  };
  const checked = envelopeSchema.safeParse(payload);
  if (!checked.success) {
    return err(...checked.error.issues.slice(0, 10).map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  const errors = await writeRaw(payload);
  if (errors.length > 0) return err(...errors);
  return ok(null);
}

/** Erase everything this app stored in this browser. */
export async function clearState(): Promise<ParseResult<null>> {
  const errors: string[] = [];
  if (indexedDbAvailable()) {
    try {
      await deleteDb();
    } catch (error) {
      errors.push(messageOf(error));
    }
  }
  try {
    clearLocal();
  } catch (error) {
    errors.push(messageOf(error));
  }
  if (errors.length > 0) return err(...errors);
  return ok(null);
}
