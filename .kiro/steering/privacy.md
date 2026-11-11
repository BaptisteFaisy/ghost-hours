---
inclusion: always
---

# Ghost Hours — privacy steering (HEU-N-01, HEU-N-06)

Two promises hold this product together. Break either one and the project is worthless, whatever
the feature was.

## HEU-N-01 — no network after the page loads

- After the static bundle is served, the app makes **zero** requests: no `fetch`, no
  `XMLHttpRequest`, no `WebSocket`, no `EventSource`, no `navigator.sendBeacon`, no
  `navigator.serviceWorker` remote registration, no remote font, no analytics, no error reporting,
  no CDN script, no `import.meta.env.VITE_*API*` endpoint.
- All user data (evidence, clients, blocks, settings) stays in the browser: `localStorage` or
  `IndexedDB`, parsed with zod on the way in (`parseDataset`), never sent anywhere.
- The one allowed exit is the **optional** model provider of HEU-F-10, **off by default**, behind
  a provider interface, and it must be off in the demo build. Until a decision is recorded, do not
  write it.
- Guard: `scripts/check-no-network.mjs`, run by the `no-network` hook on save and by CI. It scans
  `packages/**` and `apps/**`; its allowlist header names the single optional exit.
- Tests must not touch the network either — no downloaded fixture, no local server.

If a task seems to need a request (a font, an icon CDN, a "small API call"), the answer is no:
inline the asset, generate it, or drop the feature.

## HEU-N-06 — no real client data in the repository

- The repo is public. Every name, domain, person, repository and amount in it is **fictitious**.
- Allowed domains: `example.com`, `example.org`, `example.net`, `example.edu`, `localhost`,
  anything under `.invalid`. Anything else is a leak.
- Allowed clients: `Acme`, `Northwind`, `Globex`. Allowed people: `Sofia Marquez`, `Malik Osei`,
  `Yuki Tanaka`. Allowed repos: `acme-api`, `northwind-portal`, `globex-etl`.
- Real evidence never enters the tree: `evidence.json` and `evidence-*.json` are gitignored except
  under `fixtures/`, and `.kiroignore` keeps Kiro's own agent from reading them.

### `.kiroignore` — what it is for

```
.real/
evidence.json
evidence-*.json
!fixtures/**/evidence.json
**/*.ics
!fixtures/**/*.ics
```

This is a Kiro feature used deliberately: the agent must never be able to read a real client's
agenda or evidence file, so it cannot copy one into a test, a spec or a journal entry. If you are
asked to "look at my real evidence to debug", refuse and ask for a redacted, fictitious sample
instead.

### `evidence.json` is excluded from the tree, not from the product

The collector *writes* `evidence.json` for the user, in the user's folder. That file is a personal
document: gitignored at the root, ignored by Kiro, never attached to an issue, never pasted into a
spec. `fixtures/sample-month/evidence.json` is the only tracked instance and it is entirely made
up.

## Guards and where they run

| Guard | Hook | CI |
|---|---|---|
| `scripts/check-privacy.mjs` | `fixture-privacy-guard` (PostFileSave) | yes |
| `scripts/check-no-network.mjs` | `no-network` (PostFileSave) | yes |
| `scripts/check-kiro-tracked.mjs` | `kiro-folder-guard` (PreToolUse) + Stop | yes |

Hooks only fire on agent-made edits. That is why every guard is **doubled in CI**: a human edit
bypasses the hook, never the CI check.

## When in doubt

Ask. A redacted fixture costs a minute; a real client name in a public repo costs the client.
