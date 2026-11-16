# OME test and performance baseline

Recorded 2026-11-15, Phase 0, on `aphotic` (Arch Linux, Node v26.8.2,
AMD Ryzen, RTX 4090 — CPU/storage are the relevant resources here).

## Test suite results

| Suite                   | Command                                     | Result                                                                                                        |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Type check (app)        | `npx tsc --noEmit`                          | **clean**                                                                                                     |
| Type check (GUI client) | `npm run build:gui:types`                   | **clean** (via `build:npm`)                                                                                   |
| Build                   | `npm run build:npm`                         | **OK** — `dist/index.js` 404 KB, `dist/mcp.js` 340 KB, GUI assets built                                       |
| Unit + component        | `npx vitest run` (excl. e2e, e2e-collab)    | **2,282 / 2,282 passed**, 190 files, 15.45 s                                                                  |
| Lint                    | `npx eslint . --quiet`                      | **0 errors in `source/`**; 2 pre-existing errors in untracked `.router/` scratch (not shipped, not committed) |
| Format                  | `npx prettier --check "**/*.{ts,tsx}"`      | **clean**                                                                                                     |
| Stress                  | `npm run stress`                            | **not run** — docker-based (`test:containers`); no docker daemon on this box                                  |
| Collaboration e2e       | `npm run test:collab`                       | **not run** — docker-based                                                                                    |
| Vitest e2e              | `npm run test:e2e:ci`                       | **not run** — needs the docker container image or a full local browser env; recorded as the next candidate    |
| GUI (Playwright)        | `npx playwright test` (IS_CI=1, built dist) | **235 passed, 2 failed, 6 skipped** (3.4 min)                                                                 |

Playwright note: node-pty native build present, chromium 1248 installed, so
the suite is runnable here (contrary to the "bare box" caveat in AGENTS.md,
which predates the local install).

### Playwright failures on current `main` (baseline, not fixed here)

1. `source/test/e2e-gui/aside-stacking.pw.ts:38` — "the scrubber filter list
   stays above a diff header in the panel" (layout assertion).
2. `source/test/e2e-gui/bulk-actions.pw.ts:20` — "bulk actions only offer
   what applies to the selection": after a bulk action the test expected the
   first selected card (`A959105-one`) to be gone (count 0) and found 1,
   after 64 polls at the 30 s timeout. The bulk action appears to have
   applied to more than the selection.

Both are GUI-behaviour failures on the shipped `main`, recorded as baseline
defects for the rebuild's regression list (the rebuild must pass both).

## Performance baseline

Workloads: the homelab board (2,070 events, 1.2 MB, 11 actor logs — the
heaviest production board) and this repo's own board (58 events, 34 KB).

| Measurement                           | Command / method                                                                       | Result                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| CLI cold boot                         | `node dist/index.js --version` ×3                                                      | 244 / 254 / 254 ms                                                                      |
| MCP handshake                         | initialize → response, ×3 (script: `research/benchmarks/scripts/p0-mcp-handshake.mjs`) | 322.9 / 319.4 / 322.5 ms, median **322 ms**                                             |
| GUI server boot (dev, tsx)            | `ome gui` to first HTTP 200, local board                                               | **1,024 ms**                                                                            |
| Event replay, parse+sort, homelab     | `research/benchmarks/scripts/p0-replay.ts`                                             | 2,070 parsed → 1,642 unique; parse 6.91 ms, sort 2.93 ms, total **9.84 ms**; RSS 105 MB |
| Event replay, parse+sort, local board | same                                                                                   | 58 events, total **3.52 ms**                                                            |

Interpretation:

- Replay is **not** the bottleneck at production scale: 10 ms for the
  heaviest board. The event-log-as-source-of-truth decision in `DESIGN.md`
  §8 holds on this evidence. The projection (SQLite index) is needed for
  query shape (IdOrRef full scans, readiness, ledger), not for replay speed.
- Process startup (~250–320 ms) dominates every interactive surface; the
  bundles are small (400 KB), so this is Node + esbuild-external import cost,
  not bundle size.
- The 2,070 → 1,642 delta is the duplicate-write anomaly below, not lost
  data: `sortEvents` dedupes by event id.

## Data-integrity finding: duplicate event writes

**Board:** homelab (`01M3AWFV…`), file `tp6w3ve8avtjx96rz4r7rnzvcx.jsonl`
(629 lines).

**Facts (verified by line-level scan, 2026-11-15):**

- 4 event ids each appear **108 times** in that file, interleaved across
  lines 12–604, each with the same `refId` (so 108 identical siblings in the
  forest): `add.issue`, `edit.description`, `add.issue.tag`,
  `add.issue.assignee` — all on ticket `01M3MCC7DH38PZXYX3F0Q7MMRC`
  ("Blog session layer frozen at 2026-09-25…"), created 2026-09-25/28.
- That is 428 of the file's 629 lines (68%); across the board, 428 of 2,070
  parsed events (20.7%) are redundant copies.
- The write path appends the line on every attempt; nothing dedupes at write
  time. The materializer collapses duplicates on read, so the board renders
  correctly — which is why this went unnoticed.

**Why it matters for the rebuild:**

1. It is live evidence for the OME_NEXT.md requirement that "duplicate
   delivery and retry must be idempotent" (§9.3) — the current write path is
   not idempotent, and the log pays for it.
2. Any migration (Epiq → OME → Cairn) must dedupe by event id or it carries
   the bloat forward.
3. A 108× repeat suggests a retry loop that kept succeeding (each append
   returned success) — likely an ack/flush bug, not a crash-retry storm.

Root-cause status (read-only inspection, 2026-11-15): the write path is
**deliberately tolerant of duplicates on the read side** — `pending-log.ts`
documents that folds may double-land and that "`getSortedEvents` dedupes by
id, so a duplicate costs nothing" (line ~284), and git `merge=union` handles
concurrent appends. That tolerance is what makes a 108× repeat invisible:
"costs nothing" is true for rendering and false for log size. The flush
state machine (live → rotated → folded → gone, `foldedBytesOf` tracking how
many leading bytes are already in the tracked log) is the likely origin of a
non-advancing fold loop, but that is a hypothesis, not a verified cause.
Finding the actual loop is Phase 1/3 work; the ticket's date (2026-09-25)
predates the fork's MCP fix pass, so it may already be fixed — verify,
don't assume.

## Pending-log finding

`7jpc6rp6…~pending.jsonl` on the homelab board holds 7 unpublished events
(pi, 2026-11-10, a comment + contributor creation) parked by the crash-safe
write path and never flushed. The mechanism works as designed (lines survive
the crash); the operator has no visible signal that unpublished state exists.
Candidate Phase-5 surface: a `doctor` command that reports pending lines and
stranded logs (`log-integrity.ts` already has `findStrandedEventLogs`).

## Environment notes for reproducibility

- Node v26.8.2 (mise). `tsx` dev mode for source runs; `dist/` bundles for
  installed-binary numbers.
- Benchmarks are read-only: they parse the state worktree's `.ome/events/`
  files directly and never write to any board.
- The GUI boot number is dev-mode (tsx compiles on the fly); a `dist`-based
  boot would be faster.
