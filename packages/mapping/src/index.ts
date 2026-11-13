/**
 * `@ghost-hours/mapping` — evidence → client association rules (D.4, HEU-F-07/08/09).
 *
 * Pure functions only: no storage, no network, no clock. The same evidence
 * and the same clients always give the same attribution, whatever the order
 * they arrive in (HEU-F-16, HEU-P-03, HEU-P-14).
 */
export * from './types.ts';
export * from './rules.ts';
export * from './match.ts';
export * from './apply.ts';
export * from './suggest.ts';
export * from './candidates.ts';
export * from './clients.ts';
