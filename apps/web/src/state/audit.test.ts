// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { appendAudit, auditToCsv, auditToJson, describeAction, verifyAudit } from './audit.ts';

/** The decision log (idea C-06): a chained fingerprint, so tampering shows. */
const entry = (action: string, at: number, blockId?: string) => ({ at, action, blockId });

describe('audit trail', () => {
  it('chains each entry to the previous fingerprint', () => {
    const log = appendAudit([], entry('confirmBlock', 1000, 'blk:a'));
    const longer = appendAudit(log, entry('rejectBlock', 2000, 'blk:b'));
    expect(longer).toHaveLength(2);
    expect(longer[1]?.fingerprint).not.toBe(longer[0]?.fingerprint);
    expect(verifyAudit(longer).ok).toBe(true);
  });

  it('detects an altered line', () => {
    const log = appendAudit(appendAudit([], entry('confirmBlock', 1000, 'blk:a')), entry('adjustBlock', 2000, 'blk:b'));
    const tampered = log.map((item, index) => (index === 0 ? { ...item, action: 'rejectBlock' } : item));
    const check = verifyAudit(tampered);
    expect(check.ok).toBe(false);
    expect(check.brokenAt).toBe(0);
  });

  it('detects a removed line', () => {
    const log = appendAudit(appendAudit(appendAudit([], entry('a', 1)), entry('b', 2)), entry('c', 3));
    const withoutTheMiddle = log.filter((item) => item.action !== 'b');
    expect(withoutTheMiddle).toHaveLength(2);
    expect(verifyAudit(withoutTheMiddle).ok).toBe(false);
  });

  it('exports a CSV with a header and one row per entry', () => {
    const log = appendAudit([], entry('confirmBlock', 1794400000000, 'blk:a'));
    const csv = auditToCsv(log);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('timestamp,action,block,client,detail,fingerprint');
    expect(lines[1]).toContain('confirmBlock');
    expect(lines[1]).toContain('blk:a');
  });

  it('exports JSON that carries the verification verdict', () => {
    const log = appendAudit([], entry('confirmBlock', 1794400000000, 'blk:a'));
    const parsed = JSON.parse(auditToJson(log)) as { version: number; check: { ok: boolean } };
    expect(parsed.version).toBe(1);
    expect(parsed.check.ok).toBe(true);
  });

  it('describes an action with its ids, never with free text', () => {
    expect(describeAction({ type: 'confirmBlock', blockId: 'blk:a' })).toBe('blockId=blk:a');
    expect(describeAction({ type: 'reconstruct' })).toBeUndefined();
  });
});
