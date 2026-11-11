# Design — `collector`

## 1. Position in the system

```
user's folders ──▶ collector (CLI, read-only) ──▶ evidence.json ──▶ app (browser, offline)
                        │
                        └── git (read-only commands only)
```

The collector is the only component that touches the filesystem and the only one that runs outside
the browser. It is also the only place where a real client name can enter the system, which is why
its output is gitignored and `.kiroignore`d.

## 2. Components

| Module | Responsibility | Depends on |
|---|---|---|
| `cli.ts` | argument parsing, `--help`, exit codes, report to stderr | `node:util`, `collect.ts` |
| `discover.ts` | walk directories, detect repositories, respect depth and ignore list | `node:fs`, `git.ts` |
| `git.ts` | the **only** place that spawns `git`; read-only command subset | `node:child_process` |
| `commits.ts` | parse `git log` numstat output into `Evidence[]` | `git.ts`, `@ghost-hours/core` |
| `reflog.ts` | parse `git reflog` output into checkout `Evidence[]` | `git.ts`, `@ghost-hours/core` |
| `collect.ts` | orchestrate discovery + reading, build the envelope | all of the above |
| `write.ts` | atomic write of the evidence file | `node:fs` |
| `index.ts` | barrel: public API |

`git.ts` is the security boundary. Every other module receives already-parsed values.

## 3. Types and signatures

Types come from `@ghost-hours/core`; nothing is redeclared.

```ts
// types.ts (collector-local, not exported from core)
interface CollectOptions {
  roots: readonly string[];
  authorEmail: string;
  since?: Instant;            // from --since YYYY-MM-DD, resolved in options.timeZone
  until?: Instant;
  timeZone: string;           // default 'Europe/Paris'
  includeSummaries: boolean;  // false when --no-summaries
  maxDepth: number;           // default 3
  out: string;                // default './evidence.json'
}

interface RepoHandle { path: string; name: string; remote?: string }

interface CollectReport {
  repos: readonly RepoInfo[];       // from core/wire.ts
  commitCount: number;
  reflogEntries: number;
  skippedDirs: number;
  skippedLines: number;
}
```

```ts
// discover.ts
export function discoverRepos(roots: readonly string[], maxDepth: number): RepoHandle[];
export function isGitRepo(path: string): boolean;

// git.ts — read-only, no lock, no network
export function git(path: string, args: readonly string[]): string;   // throws GitError
export function gitOrNull(path: string, args: readonly string[]): string | null;

// commits.ts
export function readCommits(repo: RepoHandle, opts: CollectOptions): Evidence[];
export function parseLogLine(line: string): ParsedCommit | null;

// reflog.ts
export function readReflog(repo: RepoHandle): Evidence[];

// collect.ts
export function collect(opts: CollectOptions): { evidence: Evidence[]; report: CollectReport };

// write.ts
export function writeEvidenceFile(
  path: string, evidence: readonly Evidence[], meta: EvidenceFileMeta,
): void;
```

`writeEvidenceFile` delegates serialisation to `serializeEvidenceFile` from `@ghost-hours/core`, so
the wire format (ISO strings, `collected_at` snake_case) has exactly one implementation.

## 4. Git commands used (the whole list)

```bash
git -C <path> rev-parse --show-toplevel
git -C <path> config --get remote.origin.url
git -C <path> log --all --author=<email> --date=iso-strict \
    --pretty=format:'%H%x00%aI%x00%an%x00%ae%x00%D%x00%s' --numstat [--since=…] [--until=…]
git -C <path> reflog show --all --date=iso-strict --format='%H%x00%gd%x00%gs%x00%aI'
```

- `%aI` = author date, ISO-8601 strict, with offset. Never `%cI`.
- `--all` covers every ref, so work on an unmerged branch is not lost.
- `--numstat` gives added/deleted lines without the patch.
- NUL separators (`%x00`) so a subject containing `|` or a tab cannot break parsing.
- Every call is wrapped in `execFileSync` with `{ cwd, encoding: 'utf8', timeout: 30_000,
  maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }`.
  `GIT_OPTIONAL_LOCKS=0` is what stops Git from refreshing the index — a write, in effect.

## 5. Data flow

1. `cli.ts` parses `collect <roots…> --author <email> [--since] [--until] [--out] [--no-summaries]
   [--depth] [--tz]`, validates the email shape, and builds `CollectOptions`.
2. `discoverRepos` walks each root breadth-first, stops descending once a `.git` is found, skips
   `node_modules`, `dist`, `coverage`, `.git` and hidden directories, and de-duplicates by realpath.
3. For each repository: `readCommits` then `readReflog`, both pure parsers over `git.ts` output.
4. `collect` concatenates, sorts by `id` (stable), and builds the report.
5. `writeEvidenceFile` serialises via core and writes atomically.
6. `cli.ts` prints the report and the reminder, exits 0 (or 1 when nothing was found).

## 6. Errors

| Situation | Behaviour |
|---|---|
| root does not exist | `CollectError` with the path; exit 2 |
| `git` binary missing | `CollectError: git not found in PATH`; exit 2 |
| `git log` fails on one repository | that repository is skipped, `skippedDirs++`, run continues |
| a log line cannot be parsed | `skippedLines++`, run continues, count printed |
| `--author` missing or not an email shape | usage error, exit 2 |
| output directory not writable | error with the path, exit 2, no partial file left |
| no repository found | exit 1, one line on stderr |
| interrupted (SIGINT) | temp file removed, exit 130 |

No error message ever contains a commit subject or a repository path of a real client beyond the
path the user typed.

## 7. Properties to test

| Property | Where | Shape |
|---|---|---|
| **HEU-P-14** idempotent re-import | `collect.test.ts` | generating two runs over the same fixture repository, the sorted `items` are equal and `parseEvidenceFile(serialize(x))` is a fixed point |
| ids are deterministic | `commits.test.ts` | same commit object twice → same id; different repo → different id |
| parsing is total | `commits.test.ts` | a malformed line returns `null`, never throws |
| no write command | `git.test.ts` | the command allowlist is asserted: every `args[0]` belongs to `ALLOWED_VERBS` |

## 8. Test strategy

- Unit: `parseLogLine`, `parseReflogLine`, `discoverRepos` (over a temp tree with three fake
  `.git` directories), `writeEvidenceFile` (atomic rename, no leftover temp).
- Integration: create a throwaway repository in `os.tmpdir()` with three commits and two checkouts
  (`git init`, `git commit` with fixed dates), run `collect`, assert the produced file against a
  golden JSON. Never touch the network, never touch the user's repositories.
- Read-only proof: snapshot `git rev-parse HEAD` + sorted refs + `git status --porcelain` before and
  after; assert equality.
- Fixtures use `example.com` / `example.org` and the names Acme, Northwind, Globex only.

## 9. Reuse, not duplication

| Need | Use |
|---|---|
| ids | `commitEvidenceId`, `checkoutEvidenceId` from core |
| envelope + zod | `evidenceFileSchema`, `serializeEvidenceFile`, `parseEvidenceFile` from core |
| durations / instants | `minutesToMs`, `zonedTimeToInstant` from core |
| ISO formatting | core's serialiser only; no `toISOString()` in this package |
