# Trust — what can be faked, and what cannot

The product reconstructs hours from evidence. The honest question is not "how do we stop people
from faking" — that is impossible on a single machine — but "how do we make faking *visible*, and
how do we make *after-the-fact* faking break an independent witness". This file states the threat
model in plain terms, because a tracking system that will not say what it cannot do is not a
tracking system, it is a promise.

## The adversary, in three sizes

| Who | What they can do | What stops them |
|---|---|---|
| **A client checking a draft** | Nothing technical; they read. They can verify any claim for themselves. | Every billed hour links to its proofs; the proofs carry their fraud signals; a verification command recomputes the whole chain. |
| **The freelancer, tempted** | Re-date commits (`GIT_AUTHOR_DATE`), rewrite history, claim another repo's commits, backdate by moving the clock. | The proof carries the signals of those very tricks; nothing here relies on self-attestation alone. |
| **A third party with the machine** | Everything above, plus editing the collected `evidence.json` before import. | The chained audit log and the signature fields; ultimately the anchoring below. |

Nothing in this repository claims to *prevent* a determined, technically-capable adversary who owns
the machine. What it does is make every one of those moves **leave a mark**, and make the cheapest
one — inventing yesterday once the month is due — fail against an anchor that was published when
yesterday was today.

## The four layers

### 1. Signature and committer, per commit

The collector (read-only) now reads `%G?`, `%GS`, `%GK`, `%ce` and `%cI` for every commit. Each
proof carries them; `packages/core/src/credibility.ts` turns them into signals:

- **unsigned** — `%G?` is `N` or empty: nothing links the commit to a key, anyone could have written it.
- **signature-invalid** / **signature-unverified** — `%G?` is `B`/`U` or `X`/`Y`/`R`/`E`.
- **committer-differs** — the committer is not the author: the history has been touched by someone else or a tool.
- **committed-before-authored** — the commit instant predates the author instant: a clock has moved.

A signed, trusted commit (`G`) yields no signal. `signedShare` scores a set of proofs by how many
commits are `G`. None of this *verifies the hour* — Git does not sign times, it signs contents — it
verifies *who wrote it and that the fields are internally consistent*.

Honest limit: `GIT_AUTHOR_DATE` can still be set to any value on an unsigned or even a signed
commit; a signature proves authorship, not chronology.

### 2. The threat signals, on screen

The Evidence screen shows the signature of each proof and its signals, and each block shows its
signed share and how many proofs are not clean. The point is not to hide "bad" proofs — that would
be the one feature this product must never have — it is to make them answerable: an unsigned commit
is still work, it is simply work with less provenance. The draft can then carry the split honestly.

### 3. The chained audit log

Every decision (confirm, adjust, split, resolve) is appended with a fingerprint that hashes the
previous one. A line edited or removed afterwards breaks the chain, and the Settings screen says so.
This protects *the decisions*, not the evidence underneath them.

### 4. The anchor — faking yesterday, once yesterday is past

The weak point of all self-hosted tracking is backdating: on the 30th, invent the 3rd. Signatures
do not stop that; only an **independent witness that existed on the 3rd** does. The anchor is that
witness, and it costs one command a day:

1. At the end of the day, `scripts/anchor-evidence.mjs add evidence.json anchors.jsonl` hashes the
   day's proofs canonically and appends a line chained to the previous one:
   `sha256(previous || dayHash)`.
2. **Publish the file** to a place you do not control casually — the server of a client, a public
   repository, a paste with an independent timestamp. The publication date is the witness: it
   proves the digest existed *then*.
3. On the 30th, `anchor-evidence.mjs verify` recomputes every day from the evidence and compares
   against the published file. If a commit was moved from the 30th into the 3rd, the 3rd's digest
   changes, the chain breaks there, and the mismatch is the proof.

The anchor is deliberately independent of the product: it is a file, not a server, so nothing here
can rewrite it silently, and it works offline. The same digest can later be sent to a
timestamping service (RFC 3161 / OpenTimestamps) or committed to a public Git history; the format
does not care.

## What is out of scope, and said so

- **The hour itself**: Git signs contents, not moments. A signed commit is *authored by a key at
  some time that a clock reported*; it is not a proof someone's hands were on the keyboard then.
- **A live human presence**: a co-worker's commit, a script left running, an agent committing under
  your identity (the automation filter catches bots, not a colleague). The "delegated work" filter
  is a product idea, not a cryptographic claim.
- **A hostile OS**: root kit, `LD_PRELOAD` on git, a rewritten binary — out of scope. This is a
  static page, not a TPM.

The product's position, in one sentence: **we cannot stop you from cheating; we can make sure that
cheating is indistinguishable from declaring it.**