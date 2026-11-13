# The collector

```bash
node packages/collector/bin/ghost-hours.mjs collect ~/code \
  --author sofia@example.com --since 2026-11-01 --out evidence.json
```

The collector walks the folders you give it, finds Git repositories, reads the commits of the
selected authors **on every reference** plus the reference journal (`reflog`), and writes
`evidence.json` in the interchange format of the specification (D.10). Drop that file into the app
(Settings → Import) with your `.ics` export and your notes.

Runtime dependencies: Node.js and `git`. Nothing else (HEU-N-07).

## Read-only, and provably so

Three locks, each with a test:

1. `execFile` with an argument array — never a shell, so nothing can be injected.
2. A strict allowlist of sub-commands (`rev-parse`, `log`, `reflog`, `config --get`,
   `status --porcelain`, `for-each-ref`). Anything that writes is refused: `git config` without
   `--get`, `--output`, `--exec`, `reflog expire|delete|drop`.
3. `GIT_OPTIONAL_LOCKS=0`, so even `git status` cannot rewrite the index — and a fingerprint of the
   repository (HEAD, branch, porcelain status) taken **before and after** every repository, which
   raises if it changed.

`packages/collector/src/readonly.test.ts` checks the acceptance line of D.17 literally: every file
of the repository, `.git/` included, is byte-identical after a collection.

## Collect regularly, not once a month

The reference journal is the only thing that tells the reconstruction **where a session started**
(a branch switch at 08:50 is a better start than "first commit minus thirty minutes"). It is local
to the machine where the work happened, and Git expires it after a few months. Collecting once at
the end of the month therefore loses the best evidence.

Three ways to collect regularly:

```bash
# 1. the built-in loop (default: one round per hour)
node packages/collector/bin/ghost-hours.mjs watch ~/code \
  --author sofia@example.com --interval 30m --out evidence.json --log ~/ghost-hours.log

# 2. cron, one round per invocation
17 * * * * cd ~ && node /path/to/ghost-hours.mjs watch ~/code --author sofia@example.com --once --out evidence.json

# 3. a systemd user timer, same command with --once
```

`watch` awaits each round, so a slow collection delays the next one instead of overlapping it — two
collections of the same repository at once would be the only way to break the read-only guarantee
by accident. A failing round is logged and the loop continues. `Ctrl-C` finishes the round in
flight, then exits with code 0.

## Options

| Option | Meaning |
|---|---|
| `--author <email\|name>` | case-insensitive substring on author name or email; repeatable |
| `--since` / `--until <YYYY-MM-DD>` | local calendar days, inclusive, in `--timezone` |
| `--out <file>` | evidence file to write (default `evidence.json`), written atomically |
| `--repo <path>` | collect this repository only; repeatable; replaces the folder scan |
| `--exclude <glob>` | skip matching folders while scanning; repeatable |
| `--max-depth <n>` | folder levels scanned below each root (default 4, maximum 32) |
| `--no-summaries` | never read commit subjects (HEU-N-07, and confidentiality) |
| `--timezone <IANA>` | zone for `--since`/`--until`, written into the file |
| `--json` | print the evidence file on stdout instead of writing it |
| `--dry-run` | list the repositories and count the evidence, write nothing |
| `--interval <30s\|15m\|2h>` | `watch` only: delay between two rounds (default `1h`) |
| `--once` | `watch` only: one round then exit — for cron and timers |
| `--log <file>` | `watch` only: append a timestamped run log |

Exit codes: `0` success, `1` a repository could not be read or the file could not be written (and
nothing partial is left behind), `2` usage error.

## Confidentiality

`evidence.json` contains commit subjects and your email address: it is real client data. It is
listed in `.gitignore` and in `.kiroignore`, and the CI guard `scripts/check-privacy.mjs` fails the
build if a non-fictitious domain reaches the repository. Use `--no-summaries` when the file has to
travel, and keep it out of any tree you publish.
