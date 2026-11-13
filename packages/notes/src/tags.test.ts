import { describe, expect, it } from 'vitest';
import { extractTags, stripTags } from './index.ts';

describe('extractTags', () => {
  it('recognizes every documented client-tag shape', () => {
    expect(extractTags('#client:acme')).toEqual(['acme']);
    expect(extractTags('#acme')).toEqual(['acme']);
    expect(extractTags('@acme')).toEqual(['acme']);
    expect(extractTags('client: acme')).toEqual(['acme']);
  });

  it('is case insensitive and normalizes through slugify', () => {
    expect(extractTags('#ACME')).toEqual(['acme']);
    expect(extractTags('Client: Acme')).toEqual(['acme']);
    expect(extractTags('#Acme-API')).toEqual(['acme-api']);
    expect(extractTags('@Northwind_Portal')).toEqual(['northwind-portal']);
  });

  it('reads several tags in reading order, without duplicates', () => {
    expect(extractTags('Pairing #client:northwind then @globex')).toEqual(['northwind', 'globex']);
    expect(extractTags('#acme #ACME @acme')).toEqual(['acme']);
  });

  it('returns nothing for a line without a tag', () => {
    expect(extractTags('Fixed the CSV export')).toEqual([]);
    expect(extractTags('')).toEqual([]);
  });

  it('never reads an e-mail address as a tag', () => {
    expect(extractTags('Wrote to sarah@example.com about it')).toEqual([]);
  });

  it('honours a custom prefix list', () => {
    expect(extractTags('§acme', ['§'])).toEqual(['acme']);
    expect(extractTags('#acme', ['§'])).toEqual([]);
  });

  it('removes the tags from the text', () => {
    expect(stripTags('Exported the ledger #client:acme')).toBe('Exported the ledger ');
    expect(stripTags('Exported the ledger #client:acme @globex')).toBe('Exported the ledger  ');
  });
});
