import * as fc from 'fast-check';
import type { BillingMode, Block, BlockStatus, RoundingMode, RoundingRule, RoundingScope } from '@ghost-hours/core';
import { makeBlock } from './fixtures.ts';

/**
 * fast-check generators for the billing properties (HEU-P-08 to HEU-P-10).
 * The blocks they build are deliberately messy: mixed statuses, a missing
 * project, durations from zero to five hours, all inside November 2026 so a
 * single period contains them.
 */
export const arbRoundingMode: fc.Arbitrary<RoundingMode> = fc.constantFrom('none', 'nearest', 'up');
export const arbScope: fc.Arbitrary<RoundingScope> = fc.constantFrom('session', 'day', 'total');
export const arbStepMinutes = fc.integer({ min: 1, max: 120 });
export const arbRule: fc.Arbitrary<RoundingRule> = fc.record({
  mode: arbRoundingMode,
  stepMinutes: arbStepMinutes,
  scope: arbScope,
});
export const arbMinutes = fc.integer({ min: 0, max: 600 });
export const arbBillingMode: fc.Arbitrary<BillingMode> = fc.constantFrom(
  'hourly',
  'daily-thresholds',
  'daily-proportional',
);

const PROJECT_IDS: readonly (string | null)[] = ['acme-api', 'acme-portal', null];
const STATUSES: readonly BlockStatus[] = ['confirmed', 'locked', 'proposed', 'rejected', 'conflict'];

interface BlockSpec {
  readonly day: number;
  readonly hour: number;
  readonly minutes: number;
  readonly projectIndex: number;
  readonly statusIndex: number;
}

const arbBlockSpec: fc.Arbitrary<BlockSpec> = fc.record({
  day: fc.integer({ min: 2, max: 28 }),
  hour: fc.integer({ min: 8, max: 11 }),
  minutes: fc.integer({ min: 0, max: 300 }),
  projectIndex: fc.integer({ min: 0, max: 2 }),
  statusIndex: fc.integer({ min: 0, max: 4 }),
});

function toBlock(spec: BlockSpec, index: number): Block {
  const dayKey = `2026-11-${String(spec.day).padStart(2, '0')}`;
  const clock = `${String(spec.hour).padStart(2, '0')}:00`;
  return makeBlock({
    id: `blk-${String(index).padStart(3, '0')}`,
    dayKey,
    clock,
    minutes: spec.minutes,
    clientId: 'client-acme',
    projectId: PROJECT_IDS[spec.projectIndex] ?? null,
    status: STATUSES[spec.statusIndex] ?? 'confirmed',
    evidenceIds: [`ev-${String(index).padStart(3, '0')}`],
  });
}

export function arbBlocks(maxLength = 12): fc.Arbitrary<readonly Block[]> {
  return fc.array(arbBlockSpec, { maxLength }).map((specs) => specs.map(toBlock));
}
