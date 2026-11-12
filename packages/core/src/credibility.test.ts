import { describe, expect, it } from 'vitest';
import { credibilitySignals, isClean, isUnsigned, signedShare } from './credibility.ts';
import type { Evidence } from './types.ts';

const commit = (patch: Partial<Evidence> = {}): Evidence => ({
  id: 'git:r:1',
  source: 'git',
  kind: 'commit',
  clientId: null,
  at: 1_700_000_000_000,
  authorEmail: 'dev@example.com',
  ...patch,
});

describe('credibilitySignals', () => {
  it('is empty for a clean signed commit', () => {
    expect(credibilitySignals(commit({ signature: 'G', signer: 'Dev' }))).toEqual([]);
  });

  it('flags an unsigned commit', () => {
    expect(credibilitySignals(commit())).toContain('unsigned');
    expect(credibilitySignals(commit({ signature: 'N' }))).toContain('unsigned');
  });

  it('tells an invalid signature from an unverified one', () => {
    expect(credibilitySignals(commit({ signature: 'B' }))).toContain('signature-invalid');
    expect(credibilitySignals(commit({ signature: 'X' }))).toContain('signature-unverified');
  });

  it('flags a committer who is not the author', () => {
    expect(credibilitySignals(commit({ signature: 'G', committerEmail: 'other@example.com' }))).toContain(
      'committer-differs',
    );
  });

  it('flags a commit made before it was authored', () => {
    expect(
      credibilitySignals(commit({ signature: 'G', committedAt: 1_699_900_000_000 })),
    ).toContain('committed-before-authored');
  });

  it('leaves a checkout alone', () => {
    expect(credibilitySignals(commit({ kind: 'checkout', signature: undefined }))).toEqual([]);
  });
});

describe('aggregates', () => {
  it('isClean is the negation of the signals', () => {
    expect(isClean(commit({ signature: 'G' }))).toBe(true);
    expect(isClean(commit())).toBe(false);
  });

  it('isUnsigned only points at unsigned commits', () => {
    expect(isUnsigned(commit())).toBe(true);
    expect(isUnsigned(commit({ signature: 'G' }))).toBe(false);
  });

  it('signedShare counts only trusted signatures, and never touches non-commits', () => {
    const items = [
      commit({ id: 'a', signature: 'G' }),
      commit({ id: 'b' }),
      commit({ id: 'c', signature: 'G', kind: 'checkout' }),
    ];
    expect(signedShare(items)).toBe(0.5);
    expect(signedShare([])).toBe(1);
  });
});
