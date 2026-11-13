/**
 * `@ghost-hours/notes` — Markdown notes reader (spec D.4, HEU-F-04).
 *
 * Turns dated note files into time-stamped evidence. Pure: the caller reads
 * the files (browser `input[type=file]`, CLI reader) and hands them over.
 */
export * from './types.ts';
export * from './tags.ts';
export * from './dates.ts';
export * from './timestamps.ts';
export * from './parse.ts';
