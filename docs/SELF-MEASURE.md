# Self-Measurement: Ghost Hours Reconstructs Its Own Build

This is the final shot of the submission video, and the only non-fictional figure in the
dossier: everywhere else the sample data is invented, here the tool is pointed at a clone
of its own repository and asked how many hours it takes to build Ghost Hours.

## The measurement

- **Measured on 2026-11-11.** Evidence collected at **22:42 (Europe/Paris)**; the
  reconstruction ran on that snapshot minutes later. The repository kept receiving
  commits after the collection — including the commit adding this document — and none of
  them are counted.
- **One machine** (the operator's Linux workstation), **one repository** (a local clone of
  this project), **one Git identity** (the author's Git identity — deliberately not
  written here).
- The clone's entire history starts on 2026-11-11 at 01:03 (Europe/Paris), so the
  `--since 2026-11-11` window covers **the whole build so far**. Nothing was truncated.

Exact commands, run from the source tree:

```sh
pnpm --filter @ghost-hours/collector build

node packages/collector/bin/ghost-hours.mjs collect <path-to-a-local-clone> \
  --author "<the author's Git identity>" \
  --since 2026-11-11 \
  --out /tmp/self-evidence.json \
  --timezone Europe/Paris
```

The collector reported: 1 repository, **74 commits** and **43 reflog checkouts** —
**117 proofs** written to `/tmp/self-evidence.json`. The evidence file stays in `/tmp`;
it is never committed (it carries personal data, which this public repository forbids).

The blocks were then reconstructed with the **real engine** — no reimplementation, no
estimation. A throwaway script kept **outside the repository** (`/tmp`, run with plain
`node`; Node 22+ strips the types itself) does exactly this:

```ts
import { DEFAULT_SETTINGS, parseEvidenceFile, unwrap } from '<source-tree>/packages/core/src/index.ts';
import { sessionize } from '<source-tree>/packages/sessionizer/src/index.ts';

const { evidence } = unwrap(parseEvidenceFile(JSON.parse(read('/tmp/self-evidence.json'))), 'evidence');
// The whole build site is one and the same "client": every proof is mapped to a single
// fictitious client, then the stock algorithm runs on the stock default settings.
const result = sessionize({ evidence: evidence.map(toSingleClient), clients: [client], settings: DEFAULT_SETTINGS });
```

## Result — with the reflog

**3 blocks**, all on **2026-11-11** (Europe/Paris), all graded **solid**:

| Block | Local time | Minutes | Proofs | Proven share | Why it starts here |
|-------|------------|---------|--------|--------------|--------------------|
| 1 | 01:03 – 05:02 | 239 (3 h 59) | 40 | 1.00 | first proof; **no lead-in invented** — the default workday start (07:00) is later than the proof, so the engine adds nothing before it |
| 2 | 14:15 – 17:30 | 195 (3 h 15) | 21 | 0.85 | default 30-minute assumed lead-in before the first proof |
| 3 | 19:59 – 22:06 | 127 (2 h 07) | 13 | 1.00 | **reflog checkout at 19:59** — a proven start, nothing assumed |

- **Total: 562 minutes (9 h 22)**
- **Proven: 532 minutes (8 h 52)**
- **Assumed: 30 minutes** — 5.3 % of the total, all of it one lead-in on block 2
- Per day: 2026-11-11 → 562 minutes (the only day measured)
- Confidence: 3 × solid, 0 × likely, 0 × to-confirm
- **Conflicts: 0.** Orphan proofs: 0. Automation set aside: 0.
- Calibration: **0 samples** (the minimum is 10), so no suggested lead-in — the default
  30 minutes was used throughout.

Rounding: every figure is rounded to the nearest minute. Blocks are rounded individually
(239 + 195 + 127 = 561) while totals are rounded from the exact sum (562); the two can
differ by a minute.

## Second measurement — ignoring the reflog

The same computation with the 43 `checkout` proofs removed, i.e. what the tool would
report from commit history alone:

| | With reflog | Without reflog |
|---|---|---|
| Blocks | 3 | 3 |
| Total minutes | **562 (9 h 22)** | **592 (9 h 52)** |
| Proven minutes | 532 (8 h 52) | 532 (8 h 52) |
| Assumed minutes | **30 (5.3 %)** | **60 (10.1 %)** |
| Evening block | starts 19:59, proven share 1.00 | starts 19:29, proven share 0.81, 30-min assumed lead-in |

What the reflog actually brought, honestly stated:

- **Proven minutes are identical (532).** The reflog never inflates the measurement.
- **It removes 30 minutes of guesswork.** Without it, the engine has to invent a
  30-minute lead-in before the evening session: the claimed day grows to 592 minutes and
  the assumed share doubles from 5.3 % to 10.1 %. Those 30 minutes are exactly what
  becomes "assumed" instead of proven when the reference log is ignored.
- In this run, **exactly one of the 43 checkouts changed the reconstruction** (it seeded
  the evening block's start). The others fall inside sessions already delimited by
  commits — by design a checkout is never a block, it only proves when work started.

## Limits — stated plainly

- **One machine, one day of build, one repository.** This is a snapshot of 2026-11-11,
  not a longitudinal study.
- **No calendar and no notes were fed in**, so **zero meetings** were reconstructed;
  every block comes from Git alone.
- **The author is also the developer**: a single Git identity mapped to a single
  fictitious client, so **no inter-client conflict was possible** — the conflict
  resolution path was not exercised by this measurement.
- Operator and agent commit under the same identity, so the automation filter found
  nothing to set aside (0 ignored proofs).
- Calibration could not run (0 samples, 10 required); the lead-in stayed at its default.
- The reconstruction sees commit-visible work plus a conservative lead-in. Reading,
  thinking and reviewing between commits are only captured through that lead-in.

## How to reproduce

1. Build the collector: `pnpm --filter @ghost-hours/collector build`.
2. Run it on a local clone of this repository with your own Git identity as `--author`,
   `--since` a date that covers the history you want, `--out` a file **in `/tmp`**, and
   your `--timezone` (command above).
3. Outside the repository, write a throwaway script that imports `parseEvidenceFile` from
   the core package and `sessionize` from the sessionizer package, maps every proof to a
   single fictitious client, and runs the stock engine on `DEFAULT_SETTINGS`. Filter out
   the `checkout` proofs and run it a second time to get the no-reflog comparison.
4. Expect different figures if you measure later: the repository keeps growing. The
   numbers printed here describe the snapshot collected at 22:42 (Europe/Paris) on
   2026-11-11 and nothing else.

One honest sentence to close: **this figure measures a single day of hackathon construction led by an AI agent and its operator — not a month of ordinary client work.**
