import { z } from 'zod';
import type { Block, Client, Conflict, InvoiceDraft, ReconstructionSettings } from './types.ts';
import { DEFAULT_ROUNDING, DEFAULT_SETTINGS } from './settings.ts';
import { err, ok, type ParseResult } from './result.ts';

/**
 * Schemas for everything the browser persists or exports (HEU-F-27).
 * A dataset that fails validation is reported, never half-loaded.
 */

export const roundingRuleSchema = z.object({
  mode: z.enum(['none', 'nearest', 'up']),
  stepMinutes: z.number().positive().max(24 * 60),
  scope: z.enum(['session', 'day', 'total']),
});

export const projectSchema = z.object({ id: z.string().min(1), name: z.string().min(1) });

export const mappingRuleSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  type: z.enum(['repo', 'remote-contains', 'attendee-domain', 'title-contains', 'note-tag', 'manual']),
  value: z.string(),
  projectId: z.string().nullish(),
});

export const clientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mode: z.enum(['hourly', 'daily-thresholds', 'daily-proportional']),
  rateCents: z.number().int().nonnegative(),
  dayRateCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  rounding: roundingRuleSchema,
  projects: z.array(projectSchema),
  rules: z.array(mappingRuleSchema),
});

/** Structured explanation of a block's bounds, mirroring `BlockReason`. */
export const blockReasonSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('checkout'), repo: z.string(), minutes: z.number() }),
  z.object({
    kind: z.literal('assumed'),
    minutes: z.number(),
    boundedBy: z.enum(['previous-proof', 'workday-start', 'none']),
  }),
  z.object({ kind: z.literal('resume'), pauseMinutes: z.number() }),
  z.object({ kind: z.literal('meeting') }),
  z.object({ kind: z.literal('manual') }),
  z.object({ kind: z.literal('merged'), count: z.number() }),
  z.object({ kind: z.literal('trimmed'), byClient: z.string() }),
  z.object({ kind: z.literal('conflict'), withClient: z.string() }),
]);

export const blockSchema = z.object({
  id: z.string().min(1),
  reason: blockReasonSchema.optional(),
  start: z.number().int(),
  end: z.number().int(),
  clientId: z.string().min(1),
  projectId: z.string().nullable(),
  status: z.enum(['proposed', 'confirmed', 'rejected', 'conflict', 'locked']),
  origin: z.enum(['git-session', 'meeting', 'merged', 'manual']),
  provenShare: z.number().min(0).max(1),
  confidence: z.enum(['solid', 'likely', 'to-confirm']),
  assumedLeadInMinutes: z.number().nonnegative(),
  evidenceIds: z.array(z.string()),
  locked: z.boolean(),
  adjusted: z.boolean(),
  note: z.string().optional(),
});

export const conflictSchema = z.object({
  id: z.string().min(1),
  start: z.number().int(),
  end: z.number().int(),
  blockIds: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  reason: z.string(),
  resolved: z.boolean(),
});

export const settingsSchema = z.object({
  gapMaxMinutes: z.number().positive(),
  // Optional on input, required on output: a dataset saved before these knobs
  // existed still parses, and the app always sees a complete settings object.
  breakMaxMinutes: z.number().positive().default(60),
  ignoreAutomation: z.boolean().default(true),
  leadInDefaultMinutes: z.number().positive(),
  leadInMaxMinutes: z.number().positive(),
  minSessionMinutes: z.number().positive(),
  workdayStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  tailMinutes: z.number().nonnegative(),
  timeZone: z.string().min(1),
  dayLengthMinutes: z.number().positive(),
  fullDayFromMinutes: z.number().positive(),
  halfDayFromMinutes: z.number().positive(),
});

export const invoiceLineSchema = z.object({
  projectId: z.string().nullable(),
  label: z.string(),
  quantityMinutes: z.number().nonnegative(),
  unitLabel: z.string(),
  unitPriceCents: z.number().int().nonnegative(),
  amountCents: z.number().int(),
  evidenceCount: z.number().int().nonnegative(),
});

export const invoiceDraftSchema = z.object({
  clientId: z.string().min(1),
  clientName: z.string(),
  period: z.object({ start: z.number().int(), end: z.number().int() }),
  mode: z.enum(['hourly', 'daily-thresholds', 'daily-proportional']),
  lines: z.array(invoiceLineSchema),
  roundingRule: roundingRuleSchema,
  roundingNote: z.string(),
  subtotalCents: z.number().int(),
  taxRateBp: z.number().int().nonnegative(),
  taxCents: z.number().int(),
  totalCents: z.number().int(),
  currency: z.string().length(3),
  freeTextNotes: z.array(z.string()),
  draftLabel: z.literal('Draft'),
});

export const DATASET_VERSION = 1;

export const datasetSchema = z.object({
  version: z.literal(DATASET_VERSION),
  exportedAt: z.number().int(),
  locale: z.enum(['en', 'fr']),
  settings: settingsSchema,
  clients: z.array(clientSchema),
  blocks: z.array(blockSchema),
  conflicts: z.array(conflictSchema),
  declaredMinutes: z.record(z.string(), z.number().nonnegative().nullable()),
  invoicedPeriods: z.array(z.object({ clientId: z.string(), start: z.number().int(), end: z.number().int() })),
});

export type Dataset = z.infer<typeof datasetSchema>;

export interface DatasetInput {
  readonly exportedAt: number;
  readonly locale: 'en' | 'fr';
  readonly settings: ReconstructionSettings;
  readonly clients: readonly Client[];
  readonly blocks: readonly Block[];
  readonly conflicts: readonly Conflict[];
  readonly declaredMinutes: Readonly<Record<string, number | null>>;
  readonly invoicedPeriods: readonly { clientId: string; start: number; end: number }[];
}

export function buildDataset(input: DatasetInput): Dataset {
  return {
    version: DATASET_VERSION,
    exportedAt: input.exportedAt,
    locale: input.locale,
    settings: input.settings,
    clients: input.clients.map((client) => ({ ...client, projects: [...client.projects], rules: [...client.rules] })),
    blocks: input.blocks.map((block) => ({ ...block, evidenceIds: [...block.evidenceIds] })),
    conflicts: input.conflicts.map((conflict) => ({
      ...conflict,
      blockIds: [...conflict.blockIds],
      evidenceIds: [...conflict.evidenceIds],
    })),
    declaredMinutes: { ...input.declaredMinutes },
    invoicedPeriods: input.invoicedPeriods.map((period) => ({ ...period })),
  };
}

export function parseDataset(input: unknown): ParseResult<Dataset> {
  const parsed = datasetSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      ...parsed.error.issues.slice(0, 20).map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`),
    );
  }
  return ok(parsed.data);
}

export function parseInvoiceDraft(input: unknown): ParseResult<InvoiceDraft> {
  const parsed = invoiceDraftSchema.safeParse(input);
  if (!parsed.success) {
    return err(...parsed.error.issues.slice(0, 10).map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  return ok(parsed.data as InvoiceDraft);
}

export function defaultSettings(): ReconstructionSettings {
  return { ...DEFAULT_SETTINGS };
}

export function defaultRounding(): typeof DEFAULT_ROUNDING {
  return { ...DEFAULT_ROUNDING };
}
