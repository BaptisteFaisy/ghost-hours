import type { Dataset, Evidence } from '@ghost-hours/core';
import { parseDataset, parseEvidenceFile } from '@ghost-hours/core';
import type { ParseResult } from '@ghost-hours/core';
import type { NoteFile } from '@ghost-hours/notes';

/**
 * Reading the files the user drops (HEU-F-01, HEU-F-02, HEU-F-04).
 *
 * Everything here stays in the tab: a `File` is read with `file.text()`, no
 * request is made, and a file that cannot be read is reported with its name
 * and the reason instead of being dropped silently.
 */

export interface Rejected {
  readonly name: string;
  readonly reason: string;
}

export interface ImportPlan {
  readonly evidence: readonly Evidence[];
  readonly dataset: Dataset | null;
  readonly ics: readonly string[];
  readonly notes: readonly NoteFile[];
  readonly notesRejected: number;
  readonly rejected: readonly Rejected[];
}

const NOTE_EXTENSIONS = ['.md', '.markdown', '.txt'];

/** Read a file as text; `File.text()` where it exists, `FileReader` otherwise. */
export async function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => resolve(String(reader.result ?? ''));
    reader.onerror = (): void => reject(reader.error ?? new Error('unreadable file'));
    reader.readAsText(file);
  });
}

/** Parse the text of an `evidence.json` file (interchange format, D.10). */
export function readEvidenceFile(text: string): ParseResult<Evidence[]> {
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch (error) {
    return { ok: false, errors: [(error as Error).message] };
  }
  const parsed = parseEvidenceFile(json);
  return parsed.ok ? { ok: true, value: parsed.value.evidence } : parsed;
}

function extension(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index).toLowerCase();
}

/**
 * Sort dropped files by what they are. A JSON file is a saved dataset when
 * `parseDataset` accepts it, an evidence file when `parseEvidenceFile` does,
 * and rejected with the reason otherwise — the order matters, because a dataset
 * also contains evidence.
 */
export async function classifyAndRead(files: readonly File[]): Promise<ImportPlan> {
  const evidence: Evidence[] = [];
  const ics: string[] = [];
  const notes: NoteFile[] = [];
  const rejected: Rejected[] = [];
  let dataset: Dataset | null = null;
  for (const file of files) {
    const outcome = await classifyOne(file);
    if (outcome.kind === 'evidence') evidence.push(...outcome.value);
    else if (outcome.kind === 'dataset') dataset = outcome.value;
    else if (outcome.kind === 'ics') ics.push(outcome.value);
    else if (outcome.kind === 'notes') notes.push(...outcome.value);
    else rejected.push({ name: outcome.name, reason: outcome.reason });
  }
  return { evidence, dataset, ics, notes, notesRejected: 0, rejected };
}

type Classified =
  | { kind: 'evidence'; value: readonly Evidence[] }
  | { kind: 'dataset'; value: Dataset }
  | { kind: 'ics'; value: string }
  | { kind: 'notes'; value: readonly NoteFile[] }
  | { kind: 'rejected'; name: string; reason: string };

async function classifyOne(file: File): Promise<Classified> {
  const ext = extension(file.name);
  if (ext === '.ics') return { kind: 'ics', value: await readText(file) };
  if (NOTE_EXTENSIONS.includes(ext)) return { kind: 'notes', value: [{ path: file.name, content: await readText(file) }] };
  if (ext !== '.json') return { kind: 'rejected', name: file.name, reason: `unsupported file type "${ext || 'none'}"` };
  const text = await readText(file);
  const asDataset = parseDataset(safeJson(text));
  if (asDataset.ok) return { kind: 'dataset', value: asDataset.value };
  const asEvidence = readEvidenceFile(text);
  if (asEvidence.ok) return { kind: 'evidence', value: asEvidence.value };
  return { kind: 'rejected', name: file.name, reason: asEvidence.errors[0] ?? 'not a Ghost Hours file' };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
