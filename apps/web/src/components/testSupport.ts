/**
 * Test support shared by the DOM tests of the screens.
 *
 * jsdom, as configured by the workspace, exposes neither `localStorage` nor
 * `indexedDB`. The store reads the persisted state on mount; without a storage
 * that read fails and the store falls back to `resetAll`, which would wipe the
 * dataset a test has just loaded. This shim gives the persistence layer an
 * in-memory `localStorage`, so the store behaves as it does in a browser.
 */

export function stubBrowserStorage(): void {
  if (typeof window === 'undefined') return;
  if (window.localStorage !== undefined) return;
  const store = new Map<string, string>();
  const shim = {
    getItem: (key: string): string | null => store.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      store.set(key, String(value));
    },
    removeItem: (key: string): void => {
      store.delete(key);
    },
    clear: (): void => {
      store.clear();
    },
    key: (index: number): string | null => [...store.keys()][index] ?? null,
    get length(): number {
      return store.size;
    },
  };
  Object.defineProperty(window, 'localStorage', { value: shim, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: shim, configurable: true });
}

/** Empty the storage between tests, so one test never reads another's data. */
export function clearBrowserStorage(): void {
  window.localStorage?.clear();
}
