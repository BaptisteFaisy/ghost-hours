// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadText, openPrintWindow, printOrSave } from './download.ts';

/**
 * The print gesture has to survive the browsers that refuse it (idea R-09):
 * Safari on iOS and the in-app browsers block `window.open` even from a real
 * click. Three outcomes, three answers, and never a button that does nothing.
 */

interface FakeTab {
  opener: unknown;
  readonly document: { write: (html: string) => void; close: () => void };
  focus: () => void;
  print: () => void;
}

function fakeTab(): FakeTab & { readonly printed: string[] } {
  const printed: string[] = [];
  return {
    opener: null,
    document: {
      write: (html: string) => printed.push(html),
      close: () => undefined,
    },
    focus: () => undefined,
    print: () => undefined,
    printed,
  };
}

/** jsdom has no `URL.createObjectURL`: give `downloadText` something to use. */
function stubObjectUrls(): void {
  Object.defineProperty(URL, 'createObjectURL', {
    value: () => 'blob:ghost-hours',
    configurable: true,
    writable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: () => undefined,
    configurable: true,
    writable: true,
  });
}

function unstubObjectUrls(): void {
  delete (URL as unknown as Record<string, unknown>).createObjectURL;
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
}

afterEach(() => {
  vi.unstubAllGlobals();
  unstubObjectUrls();
});

describe('openPrintWindow', () => {
  it('answers false when the browser refuses the new tab', () => {
    vi.stubGlobal('open', () => null);
    expect(openPrintWindow('<p>draft</p>')).toBe(false);
  });

  it('writes the document and prints when the tab opens', () => {
    const tab = fakeTab();
    vi.stubGlobal('open', () => tab);
    expect(openPrintWindow('<p>draft</p>')).toBe(true);
    expect(tab.printed).toEqual(['<p>draft</p>']);
  });
});

describe('printOrSave', () => {
  it('prints when it can', () => {
    vi.stubGlobal('open', () => fakeTab());
    expect(printOrSave('draft.html', '<p>draft</p>')).toBe('printed');
  });

  it('saves the file when the print window is blocked', () => {
    vi.stubGlobal('open', () => null);
    stubObjectUrls();
    expect(printOrSave('draft.html', '<p>draft</p>')).toBe('saved');
  });

  it('says so when neither gesture is possible', () => {
    vi.stubGlobal('open', () => null);
    expect(printOrSave('draft.html', '<p>draft</p>')).toBe('unavailable');
  });
});

describe('downloadText', () => {
  it('answers false without a way to build an object URL', () => {
    expect(downloadText('timesheet.csv', 'a,b')).toBe(false);
  });
});
