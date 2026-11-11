import { describe, expect, it } from 'vitest';
import { parseEvidenceFile, serializeEvidenceFile } from './wire.ts';
import { buildDataset, parseDataset, defaultSettings } from './schema.ts';
import type { Evidence } from './types.ts';

const at = Date.UTC(2026, 10, 3, 15, 0, 0);

function sampleEvidence(): Evidence[] {
  return [
    { id: 'git:acme:01', source: 'git', kind: 'commit', clientId: null, at, repo: 'acme', summary: 'Add export' },
    { id: 'git:acme:reflog:02', source: 'git', kind: 'checkout', clientId: null, at: at - 3_600_000, repo: 'acme', to: 'feat/export' },
  ];
}

describe('evidence file (spec D.10)', () => {
  it('round-trips without data loss', () => {
    const wire = serializeEvidenceFile(sampleEvidence(), { collectedAt: at, generator: 'test' });
    const parsed = parseEvidenceFile(wire);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.evidence.map((e) => e.id)).toEqual(['git:acme:01', 'git:acme:reflog:02']);
      expect(parsed.value.evidence[0]?.at).toBe(at);
      expect(parsed.value.meta.collectedAt).toBe(at);
    }
  });

  it('reports a duplicate id instead of silently dropping it', () => {
    const wire = serializeEvidenceFile(sampleEvidence(), { collectedAt: at });
    const doubled = { ...wire, items: [...wire.items, wire.items[0]] };
    const parsed = parseEvidenceFile(doubled);
    expect(parsed.ok).toBe(false);
  });

  it('rejects a wrong version', () => {
    expect(parseEvidenceFile({ version: 2, collected_at: at, items: [] }).ok).toBe(false);
  });
});

describe('dataset', () => {
  it('validates a round-trip through the persisted shape', () => {
    const dataset = buildDataset({
      exportedAt: at,
      locale: 'en',
      settings: defaultSettings(),
      clients: [],
      blocks: [],
      conflicts: [],
      declaredMinutes: {},
      invoicedPeriods: [],
    });
    expect(parseDataset(dataset).ok).toBe(true);
    expect(parseDataset({ ...dataset, version: 99 }).ok).toBe(false);
  });
});
