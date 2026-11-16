# Teardown — Beads (gastownhall/beads)

Recorded 2026-11-15, Phase 1, from `~/ome-research/sources/beads`
(depth-50 clone of main). Go, ~5,600 files, `bd` CLI + Python MCP
(`beads-mcp`). Positioning: "distributed graph issue tracker for AI
agents, powered by Dolt". The direct competitor — and, per
`DESIGN.md` §5, the one that validates the rebuild thesis.

## 1. Address / id model

- Bead ids read `bd-main-idj`: **`<prefix>-<repo/branch>-<3-char
  short id>`**. The prefix is configurable (`issue-prefix: bd`); the
  short id is 3 characters, per-store.
- Partial-id resolution is a first-class optimized path: benchmark
  #3967 took "invalid partial-id fallback" from 124.3 ms to 22.5 ms at
  5K issues.
- No causal ordering in the id. Cross-machine order comes from Dolt's
  version control, not from the id. (Contrast OME: ULID hybrid
  logical clock, order derived from parent links.)

**Read:** beads trades global uniqueness and causal ids for a shorter,
repo-scoped address agents can type. The rebuild keeps the ULID (the
causal order is the CRDT load-bearing part) but should make the short
ref the only thing agents ever address — beads shows 3 chars resolves
fast at 10K; OME's 7-char ref is well within that budget once it goes
through one resolver.

## 2. Storage engine

- **Default: embedded Dolt** (git-like SQL database). Gives
  `bd history`, `bd branch`, `bd diff`, `bd dolt push/pull`,
  federation.
- **SQLite**: pure-Go, zero-dependency, single-writer. The rich
  commands stub out deterministically ("capability-gated addons").
- **Dolt server**: MySQL wire protocol for multi-client.
- **Postgres and MySQL adapters were built, then rolled back** before a
  tagged release (2026-07, `PROPOSAL-pluggable-storage-backends.md`,
  now "Historical — superseded"): "supporting additional
  general-purpose server databases adds substantial dialect,
  credential, schema-lifecycle, migration, CI, and operational
  complexity. Our goal is to keep Beads as simple as possible."
- The pluggable-backend seam and a differential conformance harness
  ("16 gc-contract commands behave identically on every backend,
  proven by a harness — not by code review") remain.

**Read:** the strongest external validation of `DESIGN.md` §8's hybrid
(keep the log, add a SQLite projection). Beads deleted its two server
DB adapters to stay lean; the rebuild should not add a server database
either. One embedded engine, one log, one projection.

## 3. Claim / lease semantics

- **No time-based lease.** A claim is a compare-and-set transition:
  `assignee ∈ {'', pool-alias} → me`, `status → in_progress`
  (`claim.go`, `PROPOSAL-cas-conditional-update.md`).
- Unclaim is CAS too: `bd unclaim --if-assignee X`.
- The open proposal generalizes this to a **general conditional
  update**: `UPDATE … WHERE id=? AND status IN(…) AND assignee=?` with
  `RowsAffected` as the verdict, motivated by real TOCTOU incidents in
  fleet scripts ("check-then-act on assignee/status … loses to a
  racing writer in the gap").
- Conflicts surface as structured errors (`ErrAlreadyClaimed` embeds
  the current assignee), with a round-trip test pinning the
  producer/parser pair.

**Read:** beads closes races at write time with CAS and never expires
claims. The rebuild's `Lease` entity (DESIGN.md §8) adds the expiry the
rebuild brief demands ("claimed work that stalls must be visible and
reclaimable") on top of the same CAS base: a lease is a CAS claim plus
a timestamp, and reclamation is a CAS on expiry. Both mechanisms are
cheap to compose; neither is optional.

## 4. Agent-first tool surface

- MCP is Python (`integrations/beads-mcp/`, PyPI `beads-mcp`), ~18
  tools: `beads_ready_work`, `beads_list_issues`, `beads_show_issue`,
  `beads_create_issue`, `beads_update_issue`, `beads_claim_issue`,
  `beads_close_issue`, `beads_reopen_issue`, `beads_add_dependency`,
  `beads_add_comment`, `beads_list_comments`, `beads_add_note`,
  `beads_blocked`, `beads_stats`, `beads_quickstart`, `context`,
  `beads_inspect_migration`.
- **Progressive disclosure:** `discover_tools` (names + one-liners) and
  `get_tool_info` (full parameter detail on demand). The full schema
  set is not in the context window until asked.
- **`bd ready`** is the headline query: dependency-filtered claimable
  work. Performance at 10K issues: 30 ms / 16.8 MB.
- **`bd prime`** injects workflow context into a session; `bd setup
  codex|claude|factory|cursor…` installs skills, AGENTS.md guidance
  and hooks per harness.
- **Memory plane** (`memoryops`): `bd remember / recall / forget /
  memories` — keyed persistent facts under a reserved `kv.memory.`
  namespace with **its own merge class**: "the storage merge resolver
  auto-resolves a config conflict with --theirs only when every
  conflicted key carries the kv.memory. prefix … so
  convergent-on-pull is part of what a memory MEANS and no settings
  row means that."

**Read:** three patterns to adopt directly. (1) Progressive disclosure
on the MCP surface — cheap, and it cuts the per-tool context cost the
rebuild cares about. (2) `bd ready` as a named first-class query —
the rebuild's readiness projection is the same thing, and the brief
makes it a P0. (3) The memory plane's merge class — hadal's
persistent-facts lane wants exactly "convergent-on-pull, never
settings": an Insight record that converges on pull is the right
semantic for learned facts.

## 5. Migration path

- **Export → re-init → import** is the sanctioned cross-backend move,
  "with documented fidelity limits"; in-place cross-backend data
  migration is explicitly a separate initiative.
- `bd init --from-jsonl` and `bd bootstrap` for seeding; a
  **migration freeze gate** blocks imports while a migration is in
  flight (`migration_freeze_gate_test.go`).
- No first-party Jira/Linear importers found in this clone; the import
  surface is JSONL.

**Read:** the freeze gate is the one detail worth copying for the
Epiq → OME → Cairn hop: one migration in flight, imports frozen,
fidelity limits written down before the move.

## Performance (Dolt, from BENCHMARKS.md)

| Query | 10K issues |
|---|---|
| GetReadyWork | 30 ms, 16.8 MB |
| Search (no filter) | 12.5 ms, 6.3 MB |
| Cycle detection (5K linear) | 70 ms |

These are SQL-side numbers and not directly comparable to OME's
10 ms replay of 2,070 events, but they bracket the query shapes the
projection must serve: sub-50 ms at 10K rows is the bar.

## What the rebuild takes from Beads

1. CAS claim semantics under the Lease TTL (both, composed).
2. Progressive disclosure on the MCP tool surface.
3. `ready` as a named first-class query (readiness projection).
4. A memory/insight plane with convergent-on-pull merge semantics for
   hadal's lane.
5. SQLite as the only added engine; no server database.
6. Migration with a freeze gate and documented fidelity limits.
7. Short-ref-only addressing in agent-facing text (ULID stays the
   durable id).

## What the rebuild does NOT take

- The dependency graph as the primary object. Beads is
  dependency-first (blockers drive `ready`); OME/the rebuild is
  board-first (lanes, goals, lanes' readiness). The rebuild keeps
  `blockedBy` as an edge, not the center of gravity.
- Dolt. Version-control-in-SQL is clever, but the rebuild already has
  git doing version control of the log; a second versioning layer is
  redundancy.
- Repo-scoped short ids as the durable id (no causal ordering).
