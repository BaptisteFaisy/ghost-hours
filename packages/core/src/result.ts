/**
 * A tiny result type: readers of untrusted files (evidence, `.ics`, notes)
 * must report what they rejected instead of dropping it silently
 * (HEU-F-02, risk table in D.15: "unreadable events are listed, not ignored").
 */

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err {
  readonly ok: false;
  readonly errors: readonly string[];
}

export type ParseResult<T> = Ok<T> | Err;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err(...errors: string[]): Err {
  return { ok: false, errors };
}

export function unwrap<T>(result: ParseResult<T>, context: string): T {
  if (result.ok) return result.value;
  throw new Error(`${context}: ${result.errors.join('; ')}`);
}
