#!/usr/bin/env node
/**
 * regenerates `expected.json` from `evidence.json` through the real pipeline.
 *
 * The demo's figures must never be typed by hand: they are recomputed by the
 * mapping rules and the sessionizer, exactly as the app computes them. This
 * script does that recomputation and writes the file; `real-month.test.ts`
 * repeats it on every `pnpm test` and fails if the two ever drift.
 *
 * It deliberately re-reads the evidence file with `fs` rather than importing
 * `index.ts`, so it runs with plain Node (no JSON import attributes needed).
 * The clients are the same three as `index.ts`'s `realClients` — one source of
 * truth, kept honest by the test above, which uses `index.ts`'s own clients.
 *
 *   node fixtures/real-month/regenerate.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';
import { DEFAULT_SETTINGS, monthRangeInZone, parseEvidenceFile } from '../../packages/core/src/index.ts';
import { applyRules } from '../../packages/mapping/src/index.ts';
import { sessionize } from '../../packages/sessionizer/src/index.ts';

const REPOSITORIES = ['projet-1', 'projet-2', 'projet-3'];
const clients = REPOSITORIES.map((repo, index) => ({
  id: repo,
  name: `Projet ${index + 1}`,
  mode: 'hourly',
  rateCents: 6500,
  dayRateCents: 0,
  currency: 'EUR',
  rounding: { mode: 'nearest', stepMinutes: 15, scope: 'day' },
  projects: [{ id: repo, name: repo }],
  rules: [
    { id: `${repo}:repo:${repo}`, clientId: repo, type: 'repo', value: repo, projectId: repo },
    {
      id: `${repo}:remote-contains:${repo}`,
      clientId: repo,
      type: 'remote-contains',
      value: `example.invalid:${repo}`,
      projectId: repo,
    },
  ],
}));

const here = (name) => new URL(name, import.meta.url);
const parsed = parseEvidenceFile(JSON.parse(readFileSync(here('./evidence.json'), 'utf8')));
if (!parsed.ok) {
  process.stderr.write(`evidence invalide : ${parsed.errors.join(' | ')}\n`);
  process.exit(1);
}
const evidence = parsed.value.evidence;
const period = monthRangeInZone(2026, 10, 'Europe/Paris');
const settings = { ...DEFAULT_SETTINGS };
const mapped = applyRules([...evidence], clients);
const result = sessionize({ evidence: mapped.mapped, clients, settings });
const inside = result.blocks.filter((b) => b.start < period.end && b.end > period.start);
const counted = inside.filter((b) => b.status !== 'conflict' && b.status !== 'rejected');
const minutes = (blocks) => blocks.reduce((sum, b) => sum + Math.round((b.end - b.start) / 60_000), 0);
const dayKey = (instant) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant));

const perClient = {};
for (const client of clients) {
  const own = counted.filter((b) => b.clientId === client.id);
  perClient[client.id] = { foundMinutes: minutes(own), blockCount: own.length };
}

const expected = {
  period: { year: 2026, month: 10 },
  timeZone: 'Europe/Paris',
  evidenceCount: evidence.length,
  orphanCount: mapped.orphans.length,
  ignoredAutomation: 0,
  foundMinutes: minutes(counted),
  confirmedMinutes: 0,
  declaredMinutes: null,
  ghostMinutes: null,
  ghostAmountCents: null,
  blockCount: counted.length,
  conflictCount: result.conflicts.length,
  unprovenBlocks: counted.filter((b) => b.provenShare < 0.5).length,
  solidBlocks: counted.filter((b) => b.provenShare >= 0.8).length,
  activeDays: new Set(counted.map((b) => dayKey(b.start))).size,
  assumedLeadInMinutes: counted.reduce((sum, b) => sum + b.assumedLeadInMinutes, 0),
  perClient,
};

writeFileSync(here('./expected.json'), `${JSON.stringify(expected, null, 2)}\n`);
process.stdout.write(
  `expected.json ${expected.evidenceCount} preuves, ${expected.foundMinutes} min trouvées, ${expected.blockCount} blocs, ${expected.conflictCount} contradictions\n`,
);
