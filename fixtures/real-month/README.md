# The real month

A real month of real work — **October 2026**, collected on the author's machine by this project's own
collector, then anonymized. It sits next to the [sample month](../sample-month/), which is
fictitious: the sample month tells the story, this one proves the product runs on data nobody
arranged.

Load it from the empty state or from **Settings → Data**.

## What is real, and what is a pseudonym

| Real, untouched | Replaced | Dropped |
|---|---|---|
| Every instant (`at`) | Repository names → `projet-1`, `projet-2`, `projet-3` | Commit messages (never collected: `--no-summaries`, HEU-N-07) |
| The rhythm of the days, the gaps, the nights | Remotes → `git@example.invalid:projet-N.git` | Local paths (`/home/…`) |
| Lines added and deleted per commit | Branch names → `branche-1`…`branche-437` | The author's address → `dev@example.invalid` |
| The shape of the reflog (`from` → `to`) | Evidence ids → re-derived from a hash of the original | |
| Number of repositories and their volumes | Hourly rate → a placeholder, not a price | |

`real-month.test.ts` enforces the right column: it fails if a commit message appears, if a
repository, remote, branch or author is not a pseudonym, or if a local path survives. The same test
recomputes every figure below through the real pipeline, so the numbers cannot drift from the
product either.

## The figures

977 proofs (605 commits, 372 reflog checkouts) across three repositories, and what the product makes
of them:

| | |
|---|---|
| Hours found | **34.2 h** over 13 active days |
| Blocks proposed | 21 — 9 solid (proven share ≥ 0.8), 12 to confirm |
| Contradictions | **7** — two projects claiming the same minutes |
| Assumed lead-ins | 210 minutes, 10 % of the total |
| Proofs no rule claims | 0 |
| Automation set aside | 0 |
| Declared hours | **none** — on purpose |

Per project: `projet-3` 27.8 h · `projet-1` 5.9 h · `projet-2` 0.6 h.

Two things worth noticing, because they are the reason this month is in the demo:

- **Nothing is declared.** The ghost hours — the whole point of the product — only appear once the
  reader types what they remember working. On real data, that comparison is the demonstration.
- **Seven contradictions are real.** The three repositories were worked on in parallel, sometimes in
  the same half hour. Read as one client, the same 977 proofs give **52.6 h**; read as three, they
  give 34.2 h and **7 contradictions** — 18.4 hours that two projects claim at once. A tool that
  silently merged them would have billed both sides for the same afternoon.

## How it was made

```bash
# 1. collect one month, three repositories, no commit message ever read
node packages/collector/bin/ghost-hours.mjs collect \
  --repo <projet-3> --repo <projet-1> --repo <projet-2> \
  --author <author> --since 2026-10-01 --until 2026-10-31 \
  --no-summaries --out /tmp/real.json

# 2. replace every identifying string with a pseudonym
node scripts/anonymize-evidence.mjs /tmp/real.json fixtures/real-month/evidence.json --print-map
```

The mapping printed by `--print-map` stays **out** of the repository: it is the only thing that links
a pseudonym to a real project. The script is deterministic (pseudonyms are numbered in sorted order
of the real names), so re-running it on the same file reproduces the same fixture.

`expected.json` is computed by the pipeline, never typed: the numbers above come from running the
mapping rules and the sessionizer over `evidence.json`.

## What this month does not contain

No calendar and no notes — this month is Git only, which is the honest shape of a month nobody thought
to record. The fictitious sample month is where the four sources are stitched together.
