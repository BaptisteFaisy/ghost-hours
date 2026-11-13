import type { Client, Evidence, MappingRule, RuleType } from '@ghost-hours/core';

/** Evidence split into what the rules placed and what they left alone (HEU-F-09). */
export interface MappingResult {
  readonly mapped: readonly Evidence[];
  readonly orphans: readonly Evidence[];
}

/** Rule types from strongest to weakest: the first match wins. */
export type RulePrecedence = readonly RuleType[];

/**
 * Documented precedence (HEU-F-08).
 *
 * A repository name is the least ambiguous signal, a note tag is explicit
 * but local, and a `manual` rule names one evidence id, so it is the last
 * resort. Within one type, the order is: `clients` order, then `rules`
 * order — a stable sort, never the iteration order of an object.
 */
export const DEFAULT_PRECEDENCE: RulePrecedence = [
  'repo',
  'remote-contains',
  'attendee-domain',
  'title-contains',
  'note-tag',
  'manual',
];

/** A client the heuristics of HEU-F-09 believe plausible, with its reason. */
export interface SuggestedCandidate {
  readonly clientId: string;
  /** English, explainable: names the signal that fired. */
  readonly reason: string;
  /** 0 to 1; the UI shows it as a bar, never as a promise. */
  readonly confidence: number;
}

/** Input of the immutable `makeClient` factory (HEU-F-07). */
export interface MakeClientInput {
  /** Injected id (tests, import); a random one otherwise. */
  readonly id?: string;
  readonly name: string;
  readonly mode?: Client['mode'];
  readonly rateCents?: number;
  readonly dayRateCents?: number;
  readonly currency?: string;
  readonly rounding?: Client['rounding'];
  readonly projects?: readonly { readonly id?: string; readonly name: string }[];
  readonly rules?: readonly MappingRule[];
}

export type { Client, Evidence, MappingRule, RuleType };
