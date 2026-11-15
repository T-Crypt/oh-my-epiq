# Execution log — rebrand and rebuild

## 2026-11-15 — Phase 0 start (design alignment session)

Branch: `research/rebrand-rebuild` (from `main` @ `6eb002d4`).

Work done this session:

- Baseline recon: repo, remotes, fork base v1.12.4, upstream v1.17.1
  (246 commits, 640 files, +38.7k/−14.3k), package 1.13.0, MCP surface
  (34 tools, 32 registered).
- Upstream content scan: Goals axis, filter axes, markdown tables in diffs,
  timeline refinements, MCP short-ref support and timeline-index rewrite.
- OME log mining: homelab board (only heavy board), 2,070 events since
  2026-08-15, 356 tickets, 45 closed (12.6%), 580 tag adds, 262 assignee
  adds vs 1 remove, one `~pending.jsonl` file with unpublished events
  (pi, 2026-11-10). 12 registered projects, 5 active worktrees.
- IdOrRef structural review: three hand-rolled parse sites, full-scan
  resolution, derived 7-char suffix ref without uniqueness guarantee.
- Competitor evidence pass (gh api, 2026-11-15): beads (MIT, 28.7k stars,
  pushed today), vibe-kanban (Apache-2.0, 28.7k, no sunset banner in live
  README), git-bug (GPL-3.0, study-only), Backlog.md (MIT), epiq (MIT),
  groma.md (MIT).
- Name search: candidates Cairn, Anamnesis, Mnemosyne, Palimpsest, Pelagic;
  npm names all taken in some form; `cairn-board` clear to check at release.
- `xd://` device registry not found in hadal-live checkout or pocket docs;
  logged as open question for the Phase-5 bridge rename.

Files: `research/DESIGN.md` (the aligned design document).

Verified: git branch created, files written, no user state touched.

### Phase 0 continued (same session, 14:27 onward)

- Repo identity recorded: `main` @ `6eb002d4`, remotes, tags, state branch,
  untracked `.router/` scratch preserved untouched.
- Test baseline: tsc clean (app + GUI), `build:npm` OK, unit suite
  **2,282/2,282** in 15.5 s, eslint 0 errors in `source/`, prettier clean.
  Stress + collab suites are docker-based and not run (no docker daemon).
  Playwright GUI suite running (node-pty + chromium present locally).
- Performance baseline (scripts in `research/benchmarks/scripts/`):
  CLI cold boot ~250 ms, MCP handshake median 322 ms, GUI boot 1,024 ms
  (dev), replay of the 2,070-event homelab board 9.8 ms total.
- **Data-integrity finding**: 4 event ids each written 108× (interleaved,
  same refId) in the homelab board's `tp6w3ve8…jsonl` — 428 redundant lines
  (20.7% of the board). Board renders correctly only because the
  materializer dedupes by id; the write path is not idempotent.
- **Pending-log finding**: one unflushed `~pending.jsonl` on the homelab
  board (pi, 2026-11-10) — no operator-visible signal that unpublished
  state exists.
- MCP surface measured at runtime: **19 tools default, 36 with
  `OME_MCP_FULL=true`** (corrected the earlier 34-tool estimate in
  DESIGN.md).
- Delivered `research/baseline/{OME_BASELINE,ARCHITECTURE_MAP,CLI_MCP_SURFACE,TEST_BASELINE}.md`.

Playwright GUI suite: **235 passed, 2 failed, 6 skipped** (3.4 min).
Failures on current `main`: `aside-stacking.pw.ts:38` (scrubber layout)
and `bulk-actions.pw.ts:20` (bulk action applied beyond the selection) —
recorded as baseline defects, not fixed.

Not verified yet: vitest e2e (needs container or local browser env),
competitor source teardowns (Phase 1), storage claims (Phase 3 spikes).

Next concrete actions: record Playwright result and commit Phase 0; open
`port/upstream-1.17.1`; clone Priority-A set to `~/ome-research/sources/`;
operator gates on name lock and xd:// device location.
