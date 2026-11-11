import type { Evidence, Instant } from '@ghost-hours/core';

/**
 * One Markdown file, already read.
 *
 * The reader never touches the disk: the web app hands over the files it
 * got from an `input[type=file]`, the CLI hands over the ones its own
 * reader produced. Keeping the file system out of this package makes the
 * reader pure, testable and reusable in the browser (HEU-F-04).
 */
export interface NoteFile {
  /** Path of the file, used to guess the day and to build the evidence id. */
  readonly path: string;
  /** Raw Markdown content. */
  readonly content: string;
  /** Optional modification time, kept for the reader's own bookkeeping. */
  readonly lastModified?: Instant;
}

export interface NoteParseOptions {
  /** IANA zone used to turn a local wall-clock time into an instant. */
  readonly defaultTimeZone: string;
  /** Prefixes introducing a client tag. Defaults to `['#', '@']`. */
  readonly tagPrefixes?: readonly string[];
  /** Fallback year for paths that only carry a month and a day. */
  readonly year?: number;
}

/** A line or a file the reader refused, with the reason why. */
export interface SkippedNote {
  readonly path: string;
  /** Line number (1-based) when the problem is a single line. */
  readonly line?: number;
  readonly reason: string;
}

/**
 * What the reader found: the proofs it could place in time, and what it
 * could not. Nothing is dropped silently.
 */
export interface NotesReport {
  readonly evidence: readonly Evidence[];
  readonly skipped: readonly SkippedNote[];
}
