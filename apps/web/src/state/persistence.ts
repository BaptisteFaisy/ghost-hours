import { z } from 'zod';
import { evidenceItemSchema, normalizeItem, parseDataset } from '@ghost-hours/core';
import type { Dataset, Evidence } from '@ghost-hours/core';
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

function readLocal(): unknown {
  const raw = localStorage.getItem(LS_KEY);
  if (raw === null) return null;
  return JSON.parse(raw) as unknown;
}

function writeLocal(value: unknown): void {
  localStorage.setItem(LS_KEY, JSON.stringify(value));
}

function clearLocal(): void {
  localStorage.removeItem(LS_KEY);
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
    try {
      writeLocal(value);
      return [];
    } catch (error) {
      return [messageOf(error)];
    }
  }
  try {
    await writeDb(value);
    return [];
  } catch (error) {
    // Fall back to localStorage rather than lose the user's work.
    try {
      writeLocal(value);
      return [];
    } catch (fallbackError) {
      return [messageOf(error), messageOf(fallbackError)];
    }
  }
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
  });
}

/** Load the persisted state; `null` when nothing was stored yet. */
export async function loadState(): Promise<ParseResult<PersistedState | null>> {
  let raw: unknown;
  try {
    raw = await readRaw();
  } catch (error) {
    return err(messageOf(error));
  }
  if (raw === null || raw === undefined) return ok(null);
  const parsed = parsePersisted(raw);
  if (!parsed.ok) return parsed;
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
