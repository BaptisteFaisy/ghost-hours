import type {
  Block,
  BlockOrigin,
  BlockStatus,
  Client,
  ConfidenceLevel,
  Evidence,
  Minutes,
  Period,
  Project,
  ReconstructionSettings,
} from '@ghost-hours/core';
import {
  DEFAULT_ROUNDING,
  MINUTE_MS,
  monthRangeInZone,
  parseClock,
  parseDayKey,
  resolveSettings,
  zonedTimeToInstant,
} from '@ghost-hours/core';

/**
 * Fictitious data only (HEU-N-06): Acme, Northwind, Globex, example domains.
 * Rates are the ones the specification uses for the demo: 65 €/h, 520 €/day.
 */
export const TZ = 'Europe/Paris';
export const SETTINGS: ReconstructionSettings = resolveSettings({ timeZone: TZ });
export const NOVEMBER_2026: Period = (() => {
  const range = monthRangeInZone(2026, 11, TZ);
  return { start: range.start, end: range.end };
})();

export const PROJECT_API: Project = { id: 'acme-api', name: 'acme-api' };
export const PROJECT_PORTAL: Project = { id: 'acme-portal', name: 'acme-portal' };
export const PROJECT_ETL: Project = { id: 'globex-etl', name: 'globex-etl' };

/** Instant of a wall-clock time on a day key, in the app's zone. */
export function at(dayKey: string, clock: string): number {
  const { year, month, day } = parseDayKey(dayKey);
  const minutes = parseClock(clock) ?? 0;
  return zonedTimeToInstant({ year, month, day, hour: Math.floor(minutes / 60), minute: minutes % 60 }, TZ);
}

export interface BlockSpec {
  readonly id: string;
  readonly dayKey: string;
  readonly clock: string;
  readonly minutes: Minutes;
  readonly clientId: string;
  readonly projectId?: string | null;
  readonly status?: BlockStatus;
  readonly origin?: BlockOrigin;
  readonly evidenceIds?: readonly string[];
  readonly provenShare?: number;
  readonly confidence?: ConfidenceLevel;
}

export function makeBlock(spec: BlockSpec): Block {
  const start = at(spec.dayKey, spec.clock);
  const status = spec.status ?? 'confirmed';
  return {
    id: spec.id,
    start,
    end: start + spec.minutes * MINUTE_MS,
    clientId: spec.clientId,
    projectId: spec.projectId ?? null,
    status,
    origin: spec.origin ?? 'git-session',
    provenShare: spec.provenShare ?? 0.9,
    confidence: spec.confidence ?? 'solid',
    assumedLeadInMinutes: 30,
    evidenceIds: spec.evidenceIds ?? [],
    locked: status === 'locked',
    adjusted: false,
  };
}

export const ACME: Client = {
  id: 'client-acme',
  name: 'Acme',
  mode: 'daily-thresholds',
  rateCents: 6_500,
  dayRateCents: 52_000,
  currency: 'EUR',
  rounding: DEFAULT_ROUNDING,
  projects: [PROJECT_API, PROJECT_PORTAL],
  rules: [],
};

export const NORTHWIND: Client = {
  id: 'client-northwind',
  name: 'Northwind',
  mode: 'hourly',
  rateCents: 6_500,
  dayRateCents: 52_000,
  currency: 'EUR',
  rounding: { mode: 'nearest', stepMinutes: 15, scope: 'day' },
  projects: [{ id: 'northwind-portal', name: 'northwind-portal' }],
  rules: [],
};

export const GLOBEX: Client = {
  id: 'client-globex',
  name: 'Globex',
  mode: 'hourly',
  rateCents: 6_500,
  dayRateCents: 52_000,
  currency: 'EUR',
  rounding: DEFAULT_ROUNDING,
  projects: [PROJECT_ETL],
  rules: [],
};

export const CLIENTS: readonly Client[] = [ACME, NORTHWIND, GLOBEX];

/**
 * Acme's November (D.7 P7): nine full days and one half day — 9.5 days.
 * Five days on `acme-api`, three on `acme-portal`, one day split between the
 * two projects, then a 3-hour half day, so both the per-project split and the
 * half-day threshold are exercised by the same month.
 */
export const ACME_MONTH_BLOCKS: readonly Block[] = [
  makeBlock({ id: 'acme-api-01', dayKey: '2026-11-02', clock: '09:00', minutes: 420, clientId: ACME.id, projectId: PROJECT_API.id, evidenceIds: ['git:acme-api:c1', 'git:acme-api:c2', 'meeting:weekly'] }),
  makeBlock({ id: 'acme-api-02', dayKey: '2026-11-03', clock: '09:00', minutes: 420, clientId: ACME.id, projectId: PROJECT_API.id, evidenceIds: ['git:acme-api:c3'] }),
  makeBlock({ id: 'acme-api-03', dayKey: '2026-11-04', clock: '09:00', minutes: 420, clientId: ACME.id, projectId: PROJECT_API.id }),
  makeBlock({ id: 'acme-api-04', dayKey: '2026-11-05', clock: '09:00', minutes: 420, clientId: ACME.id, projectId: PROJECT_API.id }),
  makeBlock({ id: 'acme-api-05', dayKey: '2026-11-06', clock: '09:00', minutes: 420, clientId: ACME.id, projectId: PROJECT_API.id }),
  makeBlock({ id: 'acme-portal-01', dayKey: '2026-11-09', clock: '09:00', minutes: 420, clientId: ACME.id, projectId: PROJECT_PORTAL.id }),
  makeBlock({ id: 'acme-portal-02', dayKey: '2026-11-10', clock: '09:00', minutes: 420, clientId: ACME.id, projectId: PROJECT_PORTAL.id }),
  makeBlock({ id: 'acme-portal-03', dayKey: '2026-11-11', clock: '09:00', minutes: 420, clientId: ACME.id, projectId: PROJECT_PORTAL.id }),
  makeBlock({ id: 'acme-split-api', dayKey: '2026-11-12', clock: '09:00', minutes: 240, clientId: ACME.id, projectId: PROJECT_API.id }),
  makeBlock({ id: 'acme-split-portal', dayKey: '2026-11-12', clock: '13:00', minutes: 180, clientId: ACME.id, projectId: PROJECT_PORTAL.id }),
  makeBlock({ id: 'acme-half-day', dayKey: '2026-11-13', clock: '09:00', minutes: 180, clientId: ACME.id, projectId: PROJECT_API.id }),
];

/** Evidence behind the first Acme blocks: two commits, a meeting and a note. */
export const ACME_EVIDENCE: readonly Evidence[] = [
  { id: 'git:acme-api:c1', source: 'git', kind: 'commit', clientId: ACME.id, projectId: PROJECT_API.id, at: at('2026-11-02', '10:00'), repo: 'acme-api', remote: 'example.com/acme/api', branch: 'feat/export', summary: 'Add CSV export' },
  { id: 'git:acme-api:c2', source: 'git', kind: 'commit', clientId: ACME.id, projectId: PROJECT_API.id, at: at('2026-11-02', '11:30'), repo: 'acme-api', branch: 'feat/export', summary: 'Fix rounding step' },
  { id: 'git:acme-api:c3', source: 'git', kind: 'commit', clientId: ACME.id, projectId: PROJECT_API.id, at: at('2026-11-03', '10:15'), repo: 'acme-api', summary: 'Harden import' },
  { id: 'meeting:weekly', source: 'calendar', kind: 'meeting', clientId: ACME.id, start: at('2026-11-02', '15:00'), end: at('2026-11-02', '15:30'), title: 'Weekly "sync", Acme', organizerEmail: 'sofia@example.com' },
  { id: 'note:2026-11-02', source: 'note', kind: 'note', clientId: ACME.id, at: at('2026-11-02', '16:00'), file: 'notes/2026-11-02.md', line: 12, text: 'Reviewed the export, #acme' },
];

/** Globex: thirteen 8-hour days — 104 hours found (D.7 P4). */
const GLOBEX_DAYS: readonly string[] = [
  '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06',
  '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13',
  '2026-11-16', '2026-11-17', '2026-11-18',
];

export const GLOBEX_MONTH_BLOCKS: readonly Block[] = GLOBEX_DAYS.map((dayKey, index) =>
  makeBlock({
    id: `globex-${String(index).padStart(2, '0')}`,
    dayKey,
    clock: '09:00',
    minutes: 480,
    clientId: GLOBEX.id,
    projectId: PROJECT_ETL.id,
    evidenceIds: [`git:globex-etl:c${index}`],
  }),
);

/** The contractor declared 92 hours for that month. */
export const DECLARED_MINUTES = 92 * 60;

/** Every status at once, on one day: only 3 h of it may ever be billed. */
export const MIXED_STATUS_BLOCKS: readonly Block[] = [
  makeBlock({ id: 'mix-confirmed', dayKey: '2026-11-19', clock: '09:00', minutes: 120, clientId: ACME.id, projectId: PROJECT_API.id, status: 'confirmed' }),
  makeBlock({ id: 'mix-locked', dayKey: '2026-11-19', clock: '11:00', minutes: 60, clientId: ACME.id, projectId: PROJECT_API.id, status: 'locked' }),
  makeBlock({ id: 'mix-proposed', dayKey: '2026-11-19', clock: '12:00', minutes: 300, clientId: ACME.id, projectId: PROJECT_API.id, status: 'proposed' }),
  makeBlock({ id: 'mix-rejected', dayKey: '2026-11-19', clock: '13:00', minutes: 300, clientId: ACME.id, projectId: PROJECT_API.id, status: 'rejected' }),
  makeBlock({ id: 'mix-conflict', dayKey: '2026-11-19', clock: '14:00', minutes: 300, clientId: ACME.id, projectId: PROJECT_API.id, status: 'conflict' }),
];

/** Two clients on one day: 8 h 30 together, more than one working day. */
export const OVERLOAD_BLOCKS: readonly Block[] = [
  makeBlock({ id: 'over-acme', dayKey: '2026-11-17', clock: '09:00', minutes: 240, clientId: ACME.id, projectId: PROJECT_API.id }),
  makeBlock({ id: 'over-northwind', dayKey: '2026-11-17', clock: '13:00', minutes: 270, clientId: NORTHWIND.id, projectId: 'northwind-portal' }),
];
