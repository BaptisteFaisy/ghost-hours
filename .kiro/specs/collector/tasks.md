# Tasks — `collector`

Ordered by dependency. Each task is small, verifiable, and names the test or command that proves it.
Do not tick a box until the command has actually been run and is green.

## 1. Skeleton and contract

- [ ] 1.1 Create `packages/collector/src/index.ts` as a barrel re-exporting `cli`, `collect`,
      `discover`, `commits`, `reflog`, `write`; keep the existing placeholder export removed.
      Verify: `pnpm tsc --noEmit -p packages/collector/tsconfig.json`.
- [ ] 1.2 Add `types.ts` with `CollectOptions`, `RepoHandle`, `CollectReport`, `ParsedCommit`.
      Verify: typecheck; no `any`.
- [ ] 1.3 Add `errors.ts` with `CollectError` (message + optional `path`) and `GitError`.
      Verify: typecheck.

## 2. The git boundary (do this before any parsing)

- [ ] 2.1 Write `git.ts`: `ALLOWED_VERBS` (read-only set), `git()`, `gitOrNull()` using
      `execFileSync` with `GIT_OPTIONAL_LOCKS=0`, `timeout: 30_000`, `maxBuffer: 64MB`.
      Verify: `git.test.ts` asserts every verb used in the package is in `ALLOWED_VERBS`.
- [ ] 2.2 Test the refusal path: `git(path, ['checkout', 'main'])` throws `GitError` without
      spawning. Verify: `pnpm vitest run packages/collector/src/git.test.ts`.
- [ ] 2.3 Test `gitOrNull` on a non-repository directory returns `null`, not a throw.

## 3. Repository discovery

- [ ] 3.1 Implement `discoverRepos(roots, maxDepth)`: BFS, stop at a `.git`, skip
      `node_modules`, `dist`, `coverage`, hidden dirs, de-duplicate by realpath, sort by path.
      Verify: `discover.test.ts` over a temp tree.
- [ ] 3.2 Test: a nested repository inside another repository is found once (the outer one wins,
      the inner one is not descended into). Verify: same test file.
- [ ] 3.3 Test: `maxDepth` is honoured and `isGitRepo` returns false for a bare directory.

## 4. Commits

- [ ] 4.1 Implement `parseLogLine` for the NUL-separated format; return `null` on any malformed
      line, never throw. Verify: `commits.test.ts` with a hand-written malformed line.
- [ ] 4.2 Implement `readCommits`: `git log --all --author=… --date=iso-strict … --numstat`,
      build `Evidence` with `commitEvidenceId(repo.name, sha)`, author date in `at`, `added`/
      `deleted` summed per commit, `summary` only when `includeSummaries`.
      Verify: golden test on a temp repository with three commits.
- [ ] 4.3 Test that `--no-summaries` removes every `summary` field and nothing else.
- [ ] 4.4 Test that a commit subject containing `|`, a tab and a newline does not break parsing.

## 5. Reflog

- [ ] 5.1 Implement `readReflog` → `Evidence[]` with `kind: 'checkout'`, `from`/`to` parsed from
      `checkout: moving from X to Y`, id from `checkoutEvidenceId(repo, at, to)`.
      Verify: `reflog.test.ts`.
- [ ] 5.2 Test an empty reflog: returns `[]` and the report says `reflogEntries: 0`.
- [ ] 5.3 Test a reflog message that does not match the pattern: entry kept, `from`/`to` omitted.

## 6. Orchestration and write

- [ ] 6.1 Implement `collect()`: discover → read → concatenate → sort by `id` → build `ReposInfo`.
      Verify: `collect.test.ts` over a temp repository.
- [ ] 6.2 Implement `writeEvidenceFile` with a temp file + `rename` in the same directory.
      Verify: an interrupted write (simulate by throwing before rename) leaves no partial file.
- [ ] 6.3 Test the round trip: `writeEvidenceFile` then `parseEvidenceFile` returns the same items.
      This is the first half of **HEU-P-14**.

## 7. Property HEU-P-14 — idempotent re-import

- [ ] 7.1 Write `collect.test.ts`: `it('HEU-P-14 re-collecting the same history yields the same
      items')` with `fast-check` generating a set of commits (sha, date, repo) and asserting the
      two collected arrays are equal once sorted by `id`, with a fixed seed `20261101`.
      Verify: `pnpm vitest run packages/collector`.
- [ ] 7.2 Write the app-side half: importing the same `Evidence[]` twice into the reducer leaves
      the state deeply equal. Verify: the same test file, using a reducer stub.

## 8. Read-only proof

- [ ] 8.1 Write `readonly.test.ts`: snapshot `HEAD`, sorted refs and `git status --porcelain`,
      run `collect`, snapshot again, assert equality. Verify: test green.
- [ ] 8.2 Assert no lock file appears in `.git` after the run.

## 9. CLI

- [ ] 9.1 Implement `cli.ts`: `collect <roots…> --author <email> [--since] [--until] [--out]
      [--no-summaries] [--depth] [--tz]`, `--help`, exit codes 0/1/2/130.
      Verify: `cli.test.ts` on argument parsing (pure function `parseArgs`).
- [ ] 9.2 `--since 2026-11-01` must resolve to the start of that day **in `--tz`**, using
      `zonedTimeToInstant`. Verify: test with `Europe/Paris` and `Asia/Tokyo`.
- [ ] 9.3 Print the report on stderr and the "do not commit this file" reminder at the end.
      Verify: manual run on the fixture, output pasted in the task notes.

## 10. Wiring and CI

- [ ] 10.1 Export the public API from the barrel and confirm nothing else is exported.
      Verify: `grep -c 'export' packages/collector/src/index.ts` matches the design list.
- [ ] 10.2 Run `pnpm typecheck && pnpm lint && pnpm test` at the root. Verify: all green.
- [ ] 10.3 Add the collector to the README's "what to run" section (one command, read-only).
      Verify: the command in the README works from a clean clone.

## 11. Measurement (record, do not guess)

- [ ] 11.1 Time a collection over 5 000 commits and record the number in `KIRO_JOURNAL.md`
      (HEU-N-03 target: under 2 s). If it is over, record the real number and open a task.
