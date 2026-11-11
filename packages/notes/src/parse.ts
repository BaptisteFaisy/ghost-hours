import { noteEvidenceId, parseDayKey, zonedTimeToInstant } from '@ghost-hours/core';
import type { Evidence, Instant } from '@ghost-hours/core';
import type { NoteFile, NoteParseOptions, NotesReport, SkippedNote } from './types.ts';
import { DEFAULT_TAG_PREFIXES, extractTags, stripTags } from './tags.ts';
import { dayKeyFromPathWithYear } from './dates.ts';
import { parseLineTimestamp } from './timestamps.ts';
import type { LineTimestamp } from './timestamps.ts';

interface FileResult {
  readonly evidence: Evidence[];
  readonly skipped: SkippedNote[];
}

interface ResolvedInstant {
  readonly at?: Instant;
  readonly reason?: string;
}

/**
 * Read notes into evidence (HEU-F-04).
 *
 * Pure: the files arrive already read, nothing here touches the file system.
 * A line becomes a proof only when its clock can be placed on a calendar —
 * either the line states the date, or the file does. Everything else is
 * reported in `skipped`, never dropped silently. Output is deterministic:
 * evidence sorted by (`at`, `file`, `line`), skipped by (`path`, `line`).
 */
export function parseNotes(files: readonly NoteFile[], options: NoteParseOptions): NotesReport {
  const prefixes = options.tagPrefixes ?? DEFAULT_TAG_PREFIXES;
  const evidence: Evidence[] = [];
  const skipped: SkippedNote[] = [];
  for (const file of files) {
    const result = parseFile(file, options, prefixes);
    evidence.push(...result.evidence);
    skipped.push(...result.skipped);
  }
  return { evidence: sortEvidence(evidence), skipped: sortSkipped(skipped) };
}

function parseFile(file: NoteFile, options: NoteParseOptions, prefixes: readonly string[]): FileResult {
  const dayKey = dayKeyFromPathWithYear(file.path, options.year);
  const evidence: Evidence[] = [];
  const skipped: SkippedNote[] = [];
  let fence: string | null = null;
  let sawTimestamp = false;
  const lines = file.content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const lineNo = index + 1;
    const marker = fenceMarker(line);
    if (marker !== null) {
      if (fence === null) fence = marker;
      else if (marker === fence) fence = null;
      continue;
    }
    // A timestamp inside a code block is documentation, not work.
    if (fence !== null) continue;
    const parsed = parseLineTimestamp(line);
    if (parsed.kind === 'none') continue;
    sawTimestamp = true;
    if (parsed.kind === 'invalid') {
      skipped.push({ path: file.path, line: lineNo, reason: parsed.reason });
      continue;
    }
    const resolved = resolveInstant(parsed.timestamp, dayKey, options.defaultTimeZone);
    if (resolved.at === undefined || resolved.reason !== undefined) {
      skipped.push({ path: file.path, line: lineNo, reason: resolved.reason ?? 'unresolved timestamp' });
      continue;
    }
    evidence.push(buildEvidence(file, lineNo, line, parsed.timestamp.rest, resolved.at, prefixes));
  }
  if (!sawTimestamp) {
    const reason = file.content.trim().length === 0 ? 'empty file' : 'no timestamped line found';
    skipped.push({ path: file.path, reason });
  }
  return { evidence, skipped };
}

/** Fenced code delimiter of a line, `null` when the line is prose. */
function fenceMarker(line: string): string | null {
  const trimmed = line.trimStart();
  for (const marker of ['```', '~~~']) {
    if (trimmed.startsWith(marker)) return marker;
  }
  return null;
}

/**
 * Local wall-clock to instant (HEU-N-02): a line stating an offset is
 * absolute, otherwise the zone of the reader decides.
 */
function resolveInstant(timestamp: LineTimestamp, dayKey: string | null, timeZone: string): ResolvedInstant {
  const date = timestamp.date ?? (dayKey === null ? undefined : parseDayKey(dayKey));
  if (date === undefined) {
    return { reason: 'timestamp without a date: the line has none and the file name carries none' };
  }
  const { hour, minute, second } = timestamp;
  if (timestamp.offsetMinutes !== undefined) {
    const asUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute, second);
    return { at: asUtc - timestamp.offsetMinutes * 60_000 };
  }
  return { at: zonedTimeToInstant({ ...date, hour, minute, second }, timeZone) };
}

function buildEvidence(
  file: NoteFile,
  lineNo: number,
  rawLine: string,
  rest: string,
  at: Instant,
  prefixes: readonly string[],
): Evidence {
  const tags = extractTags(rest, prefixes);
  return {
    id: noteEvidenceId(file.path, lineNo, at),
    source: 'note',
    kind: 'note',
    clientId: null,
    projectId: null,
    at,
    file: file.path,
    line: lineNo,
    text: cleanText(rest, prefixes, rawLine),
    tag: tags[0],
    raw: { rawLine, tags },
  };
}

/** Drop the tag tokens and the punctuation left by the timestamp marker. */
function cleanText(rest: string, prefixes: readonly string[], rawLine: string): string {
  const cleaned = stripTags(rest, prefixes)
    .replace(/^[\s\-–—:;,]+/, '')
    .replace(/[\s\-–—:;,]+$/, '')
    .replace(/\s+/g, ' ');
  return cleaned.length > 0 ? cleaned : rawLine.trim();
}

function sortEvidence(evidence: readonly Evidence[]): Evidence[] {
  return [...evidence].sort((a, b) => compareEvidence(a, b));
}

function compareEvidence(a: Evidence, b: Evidence): number {
  const at = (a.at ?? a.start ?? 0) - (b.at ?? b.start ?? 0);
  if (at !== 0) return at;
  const file = a.file ?? '';
  const other = b.file ?? '';
  if (file !== other) return file < other ? -1 : 1;
  return (a.line ?? 0) - (b.line ?? 0);
}

function sortSkipped(skipped: readonly SkippedNote[]): SkippedNote[] {
  return [...skipped].sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    const line = (a.line ?? -1) - (b.line ?? -1);
    if (line !== 0) return line;
    return a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0;
  });
}
