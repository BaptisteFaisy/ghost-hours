import { z } from 'zod';
import type { Evidence, EvidenceKind, EvidenceSource } from './types.ts';
import { err, ok, type ParseResult } from './result.ts';

/**
 * The `evidence.json` interchange format (specification D.10).
 *
 * On the wire, instants are ISO-8601 strings with their original offset and
 * the envelope key is `collected_at`; inside the app, instants are epoch
 * milliseconds. Both directions live here so no other module hand-rolls a
 * date conversion.
 */

export const EVIDENCE_FILE_VERSION = 1;

const isoInstant = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    const ms = typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(ms)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `invalid instant: ${String(value)}` });
      return z.NEVER;
    }
    return ms;
  });

const attendeeSchema = z.object({
  email: z.string(),
  partStat: z.enum(['accepted', 'declined', 'tentative', 'needs-action']),
});

export const evidenceItemSchema = z
  .object({
    id: z.string().min(1),
    source: z.enum(['git', 'calendar', 'note', 'manual']) as z.ZodType<EvidenceSource>,
    kind: z.enum(['commit', 'checkout', 'meeting', 'note', 'manual']) as z.ZodType<EvidenceKind>,
    at: isoInstant.optional(),
    start: isoInstant.optional(),
    end: isoInstant.optional(),
    clientId: z.string().nullish(),
    projectId: z.string().nullish(),
    repo: z.string().optional(),
    remote: z.string().optional(),
    branch: z.string().optional(),
    summary: z.string().optional(),
    added: z.number().int().nonnegative().optional(),
    deleted: z.number().int().nonnegative().optional(),
    authorEmail: z.string().optional(),
    to: z.string().optional(),
    from: z.string().optional(),
    title: z.string().optional(),
    attendees: z.array(attendeeSchema).optional(),
    organizerEmail: z.string().optional(),
    status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
    allDay: z.boolean().optional(),
    recurring: z.boolean().optional(),
    timeZone: z.string().optional(),
    file: z.string().optional(),
    line: z.number().int().nonnegative().optional(),
    text: z.string().optional(),
    tag: z.string().optional(),
    raw: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const repoInfoSchema = z.object({
  path: z.string(),
  name: z.string(),
  remote: z.string().optional(),
  commitCount: z.number().int().nonnegative().optional(),
  reflogEntries: z.number().int().nonnegative().optional(),
});

export const evidenceFileSchema = z.object({
  version: z.literal(EVIDENCE_FILE_VERSION),
  collected_at: isoInstant,
  generator: z.string().optional(),
  timeZone: z.string().optional(),
  repos: z.array(repoInfoSchema).optional(),
  items: z.array(evidenceItemSchema),
});

export type EvidenceFileWire = z.infer<typeof evidenceFileSchema>;

export interface EvidenceFileMeta {
  readonly collectedAt: number;
  readonly generator?: string;
  readonly timeZone?: string;
  readonly repos?: readonly z.infer<typeof repoInfoSchema>[];
}

export function parseEvidenceFile(input: unknown): ParseResult<{
  evidence: Evidence[];
  meta: EvidenceFileMeta;
}> {
  const parsed = evidenceFileSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      ...parsed.error.issues.slice(0, 20).map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`),
    );
  }
  const items = parsed.data.items;
  const evidence: Evidence[] = [];
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const item of items) {
    if (seen.has(item.id)) {
      duplicates.push(item.id);
      continue;
    }
    seen.add(item.id);
    evidence.push(normalizeItem(item));
  }
  if (duplicates.length > 0) {
    return err(`duplicate evidence id(s) in file: ${duplicates.slice(0, 5).join(', ')}`);
  }
  return ok({
    evidence,
    meta: {
      collectedAt: parsed.data.collected_at,
      generator: parsed.data.generator,
      timeZone: parsed.data.timeZone,
      repos: parsed.data.repos,
    },
  });
}

/** Same file imported twice must yield the same entities (HEU-P-14). */
export function normalizeItem(item: z.infer<typeof evidenceItemSchema>): Evidence {
  const { id, source, kind } = item;
  return {
    ...stripUndefined(item),
    id,
    source,
    kind,
    clientId: item.clientId ?? null,
    projectId: item.projectId ?? null,
  } as Evidence;
}

export function serializeEvidenceFile(evidence: readonly Evidence[], meta: EvidenceFileMeta): EvidenceFileWire {
  return {
    version: EVIDENCE_FILE_VERSION,
    collected_at: meta.collectedAt,
    generator: meta.generator ?? 'ghost-hours',
    timeZone: meta.timeZone,
    repos: meta.repos ? [...meta.repos] : undefined,
    items: evidence.map(toWireItem),
  } as EvidenceFileWire;
}

function toWireItem(item: Evidence): Record<string, unknown> {
  const out: Record<string, unknown> = { ...item };
  for (const key of ['at', 'start', 'end'] as const) {
    const value = item[key];
    if (typeof value === 'number') out[key] = new Date(value).toISOString();
  }
  delete out.clientId;
  delete out.projectId;
  return stripUndefined(out);
}

function stripUndefined(input: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}
