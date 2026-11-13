# Continuous integration

One rule drives everything: **the verdict lands in five minutes**, from the first job started to
the last finished. A longer run is not slow, it is broken — so jobs are split or moved out of pull
requests, and a timeout is never raised.

## Checks

| Check | What it does | Where |
|---|---|---|
| `ci` | Types, lint, tests, build, contest compliance, and the self-tests of the CI guards | `.github/workflows/ci.yml` |
| `ci-budget` | Fails when a job has no `timeout-minutes` or declares more than five minutes | `.github/workflows/ci-budget.yml` |
| `couche0` | Every changed file must appear in the `## Scope` section of the pull request; forbidden patterns (forced pushes, privileged triggers, API keys) are refused; guard files need an explicit `SAMVISION_ALLOW_GUARD_BUMP` in the body | `.github/workflows/couche0.yml` |
| `stale-base-guard` | Tells how far behind `main` a branch is, without blocking | `.github/workflows/stale-base-guard.yml` |
| `e2e` | A real browser drives the built app: the sample month's figures, no request to a foreign origin, the reviewer path, the CSV download. After a deploy and on demand — **never on a pull request** | `.github/workflows/e2e.yml`, suite in `e2e/` |

The contest compliance step of `ci` runs three guards written for this repository:

```bash
node scripts/check-kiro-tracked.mjs   # .kiro/ tracked at the root, MIT licence present
node scripts/check-privacy.mjs        # no real domain or email anywhere in the tree
node scripts/check-no-network.mjs     # no fetch, XHR, WebSocket or remote script in the app
```

They are the same scripts the Kiro hooks call, so a rule is written once and enforced twice: while
the agent works, and again on every pull request.

## Runners

Jobs run on self-hosted workers on the build server: `r630-ghost-hours-01..04`, label
`ghost-hours-worker`. Node and pnpm come from `~/tools` on that machine; `.github/ci/toolchain.sh`
finds them and exports them for every step, and falls back to whatever is already on `PATH` (so the
same workflow would run on a hosted image). The pnpm store lives on the machine, which turns an
install into a link farm instead of a download.

## Publishing the site

`.github/workflows/deploy.yml` builds `apps/web` and replaces the content of the **`gh-pages`
branch**, which is what GitHub Pages serves (build type `legacy`, source `gh-pages` / root). The
site therefore lives in the repository itself: no artifact store, no deployment API, and the public
URL keeps working for as long as the repository does. That branch is generated content — it is
replaced wholesale, never merged into, and the ruleset covers `main` only.

## Merge queue

`main` is protected by a ruleset: a pull request is mandatory, the history stays linear, and the
required checks are `ci`, `ci-budget` and `couche0`. Nobody pushes to `main`, not even an
administrator.

Mergify runs the queue (`.mergify.yml`): a pull request whose checks are green and which carries no
`hold` label and no conflict is queued, rebased, re-tested and merged. `pr-auto-merge` is the
sweeper that asks for the queueing, so no human comment is needed.

## Conflicts and red tests

Two agents work on the queue, both triggered by the sweeper:

- **Conflict agent** (`.github/fireworks/conflict_agent.py`) — when a rebase hits a conflict, it
  resolves each elementary conflict with a model, copies the rest of the file verbatim (never a full
  rewrite, which would truncate a large file), and refuses to push a resolution that does not
  compile (`compilation_gate.py`). It is bounded: a cooldown, an hourly cap and three attempts per
  pull request in thirty minutes (`quota.py`). When it cannot resolve, it says so in a comment
  instead of guessing.
- **Triage agent** (`triage-rouge.yml`) — when `ci` goes red on a pull request, it reads the failing
  job from `main` (never from the branch: a judge is not written in the courtroom), re-runs the
  failing test alone, and hands the diagnosis to the repair agent as a hint. It never merges
  anything and always stays green, so it cannot add a red check on top of a red one.

Both are observability-first: they comment what they did, and a merge always requires green checks.
