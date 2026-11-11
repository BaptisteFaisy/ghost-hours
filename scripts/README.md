# Guards — `scripts/`

Four small Node scripts (Node ≥ 22, **standard library only**, no network, no dependency) plus two
shared helper modules that hold the walking and reporting code so no guard copies it. Each script
holds one promise this project cannot afford to break. Each one is a normal CLI you can run by hand,
and each one is also called by a Kiro hook in `.kiro/hooks/` and by CI.

The hooks only fire on edits made **by the agent**; a human edit bypasses them. That is why every
guard is doubled in CI: the hook is the fast feedback loop, CI is the guarantee.

| Script | Promise it protects | Kiro hook | Exit codes |
|---|---|---|---|
| `check-privacy.mjs` | HEU-N-06 — no real client data in the tree | `fixture-privacy-guard` (PostFileSave) | 0 / 1 / 2 |
| `check-no-network.mjs` | HEU-N-01 — the app never talks to the network | `no-network` (PostFileSave) | 0 / 1 / 2 |
| `check-kiro-tracked.mjs` | contest rule — `/.kiro` present, tracked, licensed | `kiro-folder-guard` (PreToolUse, `--block`) | 0 / 1 / 2 |
| `journal-hint.mjs` | submission rule — `KIRO_JOURNAL.md` kept up to date | `journal-hint-on-stop` (Stop) | 0 (1 with `--strict`) |

Every script accepts `--help` and prints usage. Every message is in English. None of them writes a
file, reads a secret or opens a socket.

## `check-privacy.mjs`

Walks the tree (skipping `node_modules`, `dist`, `coverage`, `.git`, and `pnpm-lock.yaml`) and fails
on any email address or domain outside the fictional allowlist:

- `example.com`, `example.org`, `example.net`, `example.edu`, `localhost`, and any subdomain of
  those (`acme.example.org` is fine);
- anything under `.invalid` (reserved by RFC 2606);
- a short list of tooling hosts (`schemastore.org`, `eslint.org`, `nodejs.org`, …) which appear in
  `$schema` values and lint links, never in data.

What it judges, and what it deliberately ignores:

| Context | Judged |
|---|---|
| every email address | yes |
| every URL host | yes |
| quoted strings in `.ts` / `.tsx` / `.js` / `.mjs` | yes — a domain literal in a test is data |
| bare tokens in `.json` / `.ics` / `.yaml` / `.csv` / `.html` | yes |
| Markdown prose | emails and URLs only (`record.at` and `client.name` are property names) |

A short TLD list keeps `index.ts` and `fr.ts` out of the results, and `at` / `name` / `email` are
excluded from the bare-token pass for the same reason. Findings print as `path:line  message`.

```bash
node scripts/check-privacy.mjs
node scripts/check-privacy.mjs --root fixtures/sample-month
```

## `check-no-network.mjs`

Scans `packages/**` and `apps/**` and fails on:

- `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`;
- `import.meta.env.VITE_*API*` — a build-time endpoint baked into the bundle;
- `<script src="http…">` and `<link href="http…">` — a CDN script or a remote font;
- `require('http…')` / `from 'node:http…'` — an HTTP module, hence a request somewhere.

Comment-only lines are ignored (a comment cannot open a socket). A line ending with
`// guard-allow: no-network` is skipped, with the reason written next to it — use it for a test that
asserts a call is *absent*, never for real code.

**Allowlist (the single documented exit):** `packages/core/src/llm/provider.ts`, the optional model
provider of HEU-F-10, off by default, behind an interface, and only to be added after a recorded
decision. Nothing else in the tree may reach the network, and the demo build keeps it disabled.

```bash
node scripts/check-no-network.mjs
```

## `check-kiro-tracked.mjs`

Three contest checks, and nothing else fails the run:

1. `.kiro/` exists at the root and is a directory;
2. no `.gitignore` line ignores it (pattern list plus `git check-ignore` when the tree is a git
   repository);
3. a `LICENSE` file exists at the root and mentions MIT.

Missing sub-folders (`steering/`, `specs/`, `hooks/`, `agents/`, `skills/`) are printed as notes,
because this guard also runs while the folder is being built.

`--block` turns a finding into **exit code 2**, which the `kiro-folder-guard` `PreToolUse` hook reads
as "refuse this tool call". That is how a stray `.kiro/` line in `.gitignore` is stopped before it
lands.

```bash
node scripts/check-kiro-tracked.mjs
node scripts/check-kiro-tracked.mjs --block   # what the hook runs
```

## `journal-hint.mjs`

Compares the modification time of `KIRO_JOURNAL.md` with the newest file under `.kiro/specs/`. If a
spec or a `tasks.md` is newer, it prints one short reminder: surface used, decision taken, evidence
produced. Non-blocking by design (exit 0), because a reminder that fails a session gets removed.
`--strict` exits 1 for a CI job that wants to enforce it.

```bash
node scripts/journal-hint.mjs
node scripts/journal-hint.mjs --strict
```

## Shared code

`scripts/lib/files.mjs` — tree walking, text-file filtering, line splitting.
`scripts/lib/report.mjs` — usage printing, `Reporter`, `main()` error wrapper, `parseArgs`.

Each guard stays under 200 lines and holds no logic twice. When a fourth guard needs the same
helper, the helper goes in `lib/`, not into a copy.

## How CI calls them

One job, offline, well under the 5-minute budget (`timeout-minutes: 5`, `fetch-depth: 1`):

```yaml
- name: Guards
  run: |
    node scripts/check-privacy.mjs
    node scripts/check-no-network.mjs
    node scripts/check-kiro-tracked.mjs
    node scripts/journal-hint.mjs --strict
```

The guards run **before** `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build` in the same
job, so a leaked domain or a stray `fetch` fails in seconds instead of after the test suite. No step
of this job uses the network: dependencies are installed from the pnpm store cache or not at all.
