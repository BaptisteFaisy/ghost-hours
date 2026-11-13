/**
 * `@ghost-hours/sessionizer` — the reconstruction algorithm of spec D.5.
 *
 * Evidence in, proposed blocks out. Every assumption is named
 * (`assumedLeadInMinutes`), every contradiction is surfaced (`conflicts`),
 * and the same evidence always produces the same blocks.
 */
export { sessionize } from './algorithm.ts';
export { calibrate, CALIBRATION_MIN_SAMPLES } from './calibration.ts';
export { confidenceOf, provenShareOf } from './blocks.ts';
export { buildSessions, resolveStart, splitIntoRuns, workdayStartAt } from './sessions.ts';
export { isAutomation, partitionAutomation } from './noise.ts';
export { sessionReason } from './blocks.ts';
export type { Calibration } from './calibration.ts';
export type { LeadInCorrection, SessionizeInput, SessionizeResult } from './public-types.ts';
export type { BlockDraft, PointProof, Session } from './types.ts';
