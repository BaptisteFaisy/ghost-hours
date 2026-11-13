import type { Block, Client, Evidence, Instant } from '@ghost-hours/core';
import { blockId, resolveSettings, zonedTimeToInstant, type ReconstructionSettings } from '@ghost-hours/core';

export const TZ = 'Europe/Paris';
export const settings: ReconstructionSettings = resolveSettings({ timeZone: TZ });

/** A wall-clock instant in the test zone: `at(2026, 11, 3, 9, 0)` = 09:00 local. */
export function at(day: number, hour: number, minute = 0, month = 11, year = 2026): Instant {
  return zonedTimeToInstant({ year, month, day, hour, minute }, TZ);
}

export function client(id: string): Client {
  return {
    id,
    name: id,
    mode: 'hourly',
    rateCents: 6500,
    dayRateCents: 52_000,
    currency: 'EUR',
    rounding: { mode: 'nearest', stepMinutes: 15, scope: 'day' },
    projects: [],
    rules: [],
  };
}

export const ACME = client('acme');
export const NORTHWIND = client('northwind');
export const CLIENTS = [ACME, NORTHWIND];

export function commit(id: string, instant: Instant, clientId = 'acme', repo = 'acme-api'): Evidence {
  return { id, source: 'git', kind: 'commit', clientId, at: instant, repo, summary: `commit ${id}` };
}

export function note(id: string, instant: Instant, clientId = 'acme'): Evidence {
  return { id, source: 'note', kind: 'note', clientId, at: instant, file: 'notes.md', line: 1, text: id };
}

export function checkout(id: string, instant: Instant, clientId = 'acme', repo = 'acme-api'): Evidence {
  return { id, source: 'git', kind: 'checkout', clientId, at: instant, repo, to: 'feat/export' };
}

export function meeting(id: string, start: Instant, end: Instant, clientId = 'acme', title = 'Weekly sync'): Evidence {
  return {
    id,
    source: 'calendar',
    kind: 'meeting',
    clientId,
    start,
    end,
    title,
    attendees: [{ email: 'sofia@example.com', partStat: 'accepted' }],
    status: 'confirmed',
  };
}

export function manual(id: string, start: Instant, end: Instant, clientId = 'acme'): Evidence {
  return { id, source: 'manual', kind: 'manual', clientId, start, end };
}

export function lockedBlock(start: Instant, end: Instant, clientId: string, evidenceIds: string[]): Block {
  return {
    id: blockId(start, end, clientId, 'git-session'),
    start,
    end,
    clientId,
    projectId: null,
    status: 'locked',
    origin: 'git-session',
    provenShare: 1,
    confidence: 'solid',
    assumedLeadInMinutes: 0,
    evidenceIds,
    locked: true,
    adjusted: false,
  };
}

export function totalMinutes(blocks: readonly Block[]): number {
  return blocks.reduce((sum, block) => sum + (block.end - block.start) / 60_000, 0);
}
