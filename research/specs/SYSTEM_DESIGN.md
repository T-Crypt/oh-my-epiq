# System design

Status: draft for Phase 3 review. Implements OME_NEXT.md §9.2
SYSTEM_DESIGN deliverable and §9.1 storage candidates.

## Source of truth

The append-only event log in git (one per actor, on the state branch)
is the source of truth. The SQLite database is a **projection**: a
local, rebuildable, queryable index over the log. The two never
disagree; the log always wins on recovery.

Rules:

- A write appends a line to the actor's pending file first (crash
  safety), then commits on the state branch. This is OME's current
  mechanism and it works; it is retained.
- The projection is updated in the same transaction as the local
  apply. If the projection is lost or corrupt, it is rebuilt from the
  log on next boot. No data loss, only a rebuild cost.
- Sync operates on the log, never on the projection. The projection
  is per-machine and is never pushed.
- The projection schema is versioned. A schema bump rebuilds the
  projection from the log, which is the only migration the projection
  ever needs.

## Components

```
[CLI / TUI / MCP / GUI] -> [Application core] -> [Log writer]
                                          \-> [Projection (SQLite)]
                                          \-> [Ledger index] (subset)
```

- Application core: deterministic functions over the current state
  (readiness, capsule, validity, completion). No model calls.
- Log writer: append-only, pending-first, flush on sync.
- Projection: SQLite with WAL, one writer per process, rebuildable.
- Ledger index: the execution ledger is a view over the projection,
  not a second database.

## Concurrency

- One writer per actor log on a machine (existing OME model).
- Cross-machine: git rebase of the state branch; the union of event
  sets is the merge, not text.
- Within a machine: the SQLite writer serializes writes; readers
  overlap via WAL. The log is the gate, not the database.
- Task claims: atomic via the log's ordering plus a fencing token;
  the SQLite projection mirrors the result and is not the authority.

## Sync

- On demand (`sync`), exactly as today.
- Publishes an unpushed state branch if one exists (upstream #538).
- Tombstones are never swept across worktrees (upstream H9SEJN2).
- Conflicts are explained, not silently merged.

## Failure modes (each specified, each tested)

- Crash mid-write: pending line flushes on next boot.
- Crash during claim: lease lapses, work item returns to ready.
- Projection corrupt: rebuild from log, report duration.
- Late write from a dead holder: rejected by fencing token.
- Offline: local log grows; merge on reconnect.
- Sync interrupted: abort, not quit; rebase restarts cleanly.
- Migration interrupted: freeze gate; resume from last completed step.

## Performance targets

From upstream CI (`port/PORT_NOTES.md`): 400k events, read under 2 s.
Local targets: CLI cold boot under 300 ms (current 250 ms), MCP
handshake under 300 ms (current 322 ms, target the production bundle
fix), capsule assembly under the agent's step time.

## What is not in this design

Embedded agent runtime, server database, vector store, GraphQL, hosted
sync, notifications, analytics. All are non-goals for P0.
