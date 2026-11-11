// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stubBrowserStorage } from '../components/testSupport.ts';
import { clearState, loadState, saveState, storageKind } from './persistence.ts';
import { DEFAULT_SETTINGS } from '@ghost-hours/core';

/**
 * The browser matrix the doc describes (idea R-09): IndexedDB when present,
 * localStorage when not, memory when private browsing forbids a write. jsdom
 * ships no IndexedDB, so the 'indexeddb' branch is exercised in the browser; the
 * fallbacks are exercised here.
 */

const dataset = {
  version: 1 as const,
  exportedAt: 0,
  locale: 'en' as const,
  settings: DEFAULT_SETTINGS,
  clients: [],
  blocks: [],
  conflicts: [],
  declaredMinutes: {},
  invoicedPeriods: [],
};

const persisted = {
  dataset,
  evidence: [],
  corrections: [],
  taxRateBp: 0,
  freeTextNotes: [],
  annexDetail: 'durations' as const,
  activeMonth: { year: 2026, month: 11 },
  activeWeekStart: null,
  audit: [
    {
      id: '1:abc',
      at: 1794400000000,
      action: 'confirmBlock',
      blockId: 'blk:x',
      fingerprint: 'abc',
    },
  ],
};

describe('storageKind (idea R-09)', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).localStorage;
  });

  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).localStorage;
  });

  it('reports memory when nothing is writable', () => {
    expect(storageKind()).toBe('memory');
  });

  it('reports localStorage when it is present', () => {
    stubBrowserStorage();
    expect(storageKind()).toBe('localstorage');
  });
});

describe('persistence round-trip', () => {
  afterEach(async () => {
    await clearState();
    delete (globalThis as Record<string, unknown>).localStorage;
  });

  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).localStorage;
    stubBrowserStorage();
  });

  it('keeps the audit trail across save and load', async () => {
    const saved = await saveState(persisted);
    expect(saved.ok).toBe(true);
    const loaded = await loadState();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value?.audit).toEqual(persisted.audit);
  });

  it('loads null when nothing was saved', async () => {
    await clearState();
    const loaded = await loadState();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.value).toBeNull();
  });
});
