# ADR-0001: Storage and source of truth

Status: accepted (draft, pending Phase 3 evidence).
Date: 2026-11-16.

## Context

The current product keeps an append-only event log per actor in git on
a state branch, materialized in memory, with a crash-safe pending file.
Benchmarks on the heaviest production board: 2,070 events replay in
9.8 ms. Queries today scan the materialized state (IdOrRef full
board scan; readiness does not exist yet). The rebuild adds a work
graph, leases, an execution ledger, and a context capsule, all of which
need indexed queries. Candidate engines: keep the log only, SQLite,
Dolt, Git-native object/DAG, CRDT, or a hybrid.

## Options considered

1. **Keep the log only (status quo).** Zero new dependency. Replay is
   fast at 2,070 events. Does not scale to indexed queries; the
   400k-event CI bar from upstream (`port/PORT_NOTES.md`) is about
   reads, not replay, and the projection is the read path.
2. **SQLite with WAL.** Mature embedded engine, indexing, transactions,
   one file. Single writer per process; WAL requires same-host shared
   memory, so no live DB over a network filesystem. Sync must be
   designed separately.
3. **Dolt.** SQL plus git-like commits, branches, diffs, merges,
   remotes. Rich, and the right answer if collaboration becomes the
   center of gravity. Install footprint, operational complexity, and
   performance under our workload are unmeasured; beads deleted its
   Postgres/MySQL adapters to stay lean.
4. **Git-native object/DAG (git-bug style).** Every entity version in
   git. Read-amp and disk cost; whole-repo inspectability. Redundant
   with the log we already keep.
5. **CRDT.** Distributed and offline-friendly, but conflict semantics,
   schema evolution, and merge explainability are costly; no user
   problem in P0 requires it.
6. **Hybrid: log as source of truth, SQLite as local projection.**
   Best of 1 and 2. The log keeps portability, history, offline
   operation, and deterministic replay; SQLite provides indexed
   queries, transactions, and crash recovery for the local view. The
   projection is rebuildable and is never pushed.

## Decision

Hybrid: the append-only event log in git is the source of truth; a
local SQLite projection (WAL) is the read and query index. The
projection is per-machine, rebuildable from the log, and never
synchronized. Sync operates on the log only.

## Consequences

- One writer per machine for the projection; the log already serializes
  per actor, so this matches.
- Cross-machine consistency is eventual, through the log's merge, not
  through a shared database. No live DB over a network filesystem.
- The projection schema is versioned; a bump rebuilds from the log.
- Crash recovery: pending-first writes for the log; SQLite transactions
  for the projection. A crash leaves either a pending line or an
  uncommitted transaction; both recover on boot.
- The 400k-event, 2-second-read SLO is a projection read, not a log
  replay.

## Evidence

- Baseline replay: 9.8 ms at 2,070 events (`baseline/TEST_BASELINE.md`).
- Upstream CI stress gate: 400k events, read under 2 s
  (`port/PORT_NOTES.md`).
- Beads deleted its Postgres and MySQL adapters, keeping Dolt + SQLite
  (`competitors/beads/TEARDOWN.md` §2).
- Vibe Kanban runs flat SQLite + indexes at real load
  (`competitors/vibe-kanban/TEARDOWN.md` §2).
- SQLite WAL constraints documented in the vision doc §7.6.

## Rejected alternatives and why

- **Dolt**: kept as a documented candidate, not selected. The
  operational footprint and performance under our workload are
  unmeasured; beads' own lean-out is the caution. Reconsider if a
  later requirement (branching queries, multi-writer collaboration)
  cannot be met by the log + projection.
- **Log only**: rejected because readiness, lease, and capsule queries
  need indexes the log cannot provide at the 400k bar.
- **CRDT**: rejected for P0; no user problem requires it. Reconsider
  if multi-writer same-document editing becomes a requirement.
- **Git-native object store**: rejected; redundant with the log.

## Conditions that would trigger reconsideration

- A measured projection rebuild cost that blocks normal boot.
- A requirement for multi-writer same-machine concurrency beyond one
  process.
- A requirement for hosted collaboration with live queries (P2).
- Dolt benchmarks showing materially better fit for a specific
  workload, with the footprint justified.
