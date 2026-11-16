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
storage claims (Phase 3 spikes).

### Phase 1 (same session, 14:53 onward)

- `port/upstream-1.17.1` branch built: upstream `d66d1db7` (v1.17.1) +
  the OME rename map (`research/port/apply-rename.sh`, 373 files,
  15 paths renamed, attribution URLs + LICENSE protected). Committed
  as `f48db959`. tsc clean; unit suite **2592/2592** (one test fix:
  a sort-order assertion that only sorted correctly under the name
  epiq). Note: the port initially absorbed local untracked state
  (`.router/`, `docs/VISION.md`, worktree gitlinks); amended out of
  the commit, fork's ignore lines applied.
- 246-commit upstream analysis (`research/port/PORT_NOTES.md`):
  seven axes — Goals entity, repos-as-board-events (project.json no
  longer edited), `Epiq-Ref` trailer + git-search commit lookup,
  filter axes (tag/contributor/goal), CI stress at **400k events / 2 s
  read SLO**, compact MCP replies + descriptions riding with
  assume/get, sync hardening (tombstones, unpushed-branch publish).
  Fork gap list: 8 items.
- Competitor clones in `~/ome-research/sources/` (depth 50):
  beads, vibe-kanban, git-bug.
- Teardowns (`research/teardowns/`):
  - **BEADS** — Dolt/SQLite storage (PG/MySQL adapters built then
    deleted for simplicity); CAS claim semantics, no TTL; 18-tool
    MCP with progressive disclosure; memory plane with
    convergent-on-pull merge class; 30 ms ready-work at 10K.
  - **VIBE_KANBAN** — server-centric; flat SQLite + 40+ migrations;
    workspace = worktree + branch + terminal + dev server; 10+ agent
    executors (ACP first-class); inline diff comments become the
    agent's next prompt via stdin; attempt/turn/seen bookkeeping.
  - **GIT_BUG** — closest architecturally: event-sourced entities on
    git, content-addressed sha256 ids, persisted Lamport clocks,
    DQL query language (lexer + parser), prefix id resolution
    "long enough to be unique".
- `research/PHASE1_SYNTHESIS.md`: 6 decisions confirmed, 3 changed or
  sharpened (DQL-shaped qualifier filters; attempt/turn/seen
  bookkeeping on record types; ops as addressable entities), 7
  patterns explicitly rejected with named reasons, work items fed
  into P2/P3/P5.

Not verified yet: competitor teardowns are from depth-50 clones
(full-history claims, e.g. beads proposal dates, unverified);
upstream GUI behaviour (Goals UI, filters) not exercised in a
browser, only read from the diffed tree and commit subjects;
storage and validity claims await Phase 3 spikes.

### Phase 2 (same session, 14:22 onward)

- Specs written (`research/specs/`): `PRODUCT_REQUIREMENTS.md`,
  `CORE_DOMAIN_MODEL.md`, `WORKFLOWS.md`, `EXECUTION_LEDGER_SPEC.md`,
  `CONTEXT_CAPSULE_SPEC.md`, `EVIDENCE_AND_VERIFICATION_SPEC.md`,
  `SECURITY_AND_PRIVACY.md`, `SYSTEM_DESIGN.md`, `IMPLEMENTATION_PLAN.md`,
  `CLI_CONTRACT.md`, `MCP_CONTRACT.md`.
- ADRs written (`research/decisions/`): ADR-0001 storage (hybrid),
  ADR-0002 event model, ADR-0003 graph model, ADR-0004 leases,
  ADR-0005 context capsules, ADR-0006 migration.
- Papers (`research/papers/`): execution state, context compaction,
  MCP protocol.
- Research layout moved to the vision doc's required structure:
  teardowns -> `competitors/{beads,vibe-kanban,git-bug}/TEARDOWN.md`;
  `COMPETITOR_MATRIX.md`, `OPPORTUNITY_ANALYSIS.md` added.
- The product model is now defined without naming a UI framework or
  storage engine; P0 scope is the spine (graph, readiness, leases,
  ledger, evidence, capsules, compact CLI/MCP, migration); non-goals
  are held (no embedded agent, no server database, no vector store,
  no GraphQL door, no hosted sync).

Next concrete actions: Phase 3 spikes — graph readiness, lease
manager, execution ledger, capsule assembly, evidence freshness,
storage comparison against the 400k/2s bar; operator gates on name
lock and xd:// device location.
