// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { en } from './en.ts';
import { fr } from './fr.ts';

/**
 * A missing or empty translation is a hole in the product: the judges read the
 * app in English, the author in French, and both must be complete (HEU-N-05).
 */
describe('i18n parity', () => {
  const keys = Object.keys(en) as (keyof typeof en)[];

  it('has the same keys in both dictionaries', () => {
    expect(Object.keys(fr).sort()).toEqual([...keys].sort());
  });

  it('has no empty value and no leftover placeholder', () => {
    for (const key of keys) {
      expect(en[key].trim().length, key).toBeGreaterThan(0);
      expect(fr[key].trim().length, key).toBeGreaterThan(0);
      expect(key.includes('{'), key).toBe(false);
    }
  });

  it('interpolates the same placeholders in both languages', () => {
    const place = (value: string): string[] => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
    for (const key of keys) {
      if (place(en[key]).length === 0) continue;
      expect(place(fr[key]), key).toEqual(place(en[key]));
    }
  });
});
