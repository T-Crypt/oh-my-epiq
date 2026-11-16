# OME architecture map

Recorded 2026-11-15, Phase 0. One npm package, four faces over one state model.

## Entry points

| Entry                    | File                                           | Face                                    |
| ------------------------ | ---------------------------------------------- | --------------------------------------- |
| CLI + TUI + GUI launcher | `source/Index.tsx`                             | `ome`                                   |
| TUI boot                 | `source/boot-tui.tsx`                          | terminal board (ink/react)              |
| MCP server               | `source/mcp/index.ts` → `source/mcp/server.ts` | `ome-mcp`                               |
| GUI server               | `source/gui/api/instance.ts`                   | `ome gui` (port `OME_GUI_PORT` or 3710) |
| GUI client               | `source/gui/client/`                           | React, built to `dist/gui`              |

## Module tree (by role)

```
source/
├── Index.tsx, boot-tui.tsx, logger.ts, version.ts
├── lib/
│   ├── event/        event envelope, load, materialize, persist, write,
│   │                 pending-log (crash-safe park), catalog, log-signature
│   ├── board/        board-events.model.ts (43 actions, 9 entity kinds),
│   │                 board-boot, board-materialize, board-replay,
│   │                 format-log-utils
│   ├── model/        app-state.model.ts, result-types (Result/succeeded/failed)
│   ├── state/        state.ts, cmd.state (command history), node-builder
│   ├── storage/      file-manager (hydrated .ome state)
│   ├── migration/    migrate-epiq.ts (the one sanctioned state-branch writer
│   │                 outside the event path)
│   ├── git/          sync.ts, sync-lock.ts, sync-and-reload-state.ts,
│   │                 log-integrity.ts, git-utils.ts, git.ts, git-storage.ts,
│   │                 git-commands.ts
│   ├── collab/       agent collaboration board (notes, requests, handoffs)
│   ├── commits/      code-to-ticket linking, diff stats
│   ├── stats/        issue stats (commits per ticket)
│   ├── command-line/ commands/ (32 CLI commands), palette, input
│   ├── actions/      default, help, identity, input, move, palette
│   ├── components/   TUI components (ink)
│   ├── boot/         load-project (project resolution, hydration)
│   ├── config/, project-setup/, repository/, editor/, hints/, listeners/,
│   ├── media/, static/, theme/, utils/ (node-ref, date-utils, …),
│   └── virtual-nodes/
├── mcp/
│   ├── server.ts     tool registration (34 tools, 32 by default)
│   ├── api/          per-domain handlers (issues, swimlane-stats, …)
│   ├── ome-api.ts, ome-init.ts, ome-issue-stats.ts, ome-skill.ts,
│   ├── ome-time-travel.ts, timeline-index.ts, args.ts, api-state.model.ts
│   └── skill-content.ts (regenerated from skills/ome/SKILL.md at build)
├── gui/
│   ├── api/          HTTP + websocket API server, lib/ (websocket,
│   │                 remote-access, origin-guard, …)
│   └── client/       React board; components/ (PocketShell, …),
│                     lib/ (gui-theme, commands, scrubber)
├── export/           markdown export
├── scripts/          build (gui, sea, npm), scratch-board, pre-push, stress
└── test/             unit (190 files), e2e/, e2e-collab/ (docker), e2e-gui/,
                      helpers/, setup/
```

## Event model

- **Append-only per actor.** Every write appends one line to the actor's
  `<actorId>.jsonl` in the state worktree. Nothing is edited in place.
- **Materialization.** `event-load` parses and chains (`sortEvents`: one
  genesis root, orphans anchored after); `board-materialize` folds events
  into the node tree (workspace → board → swimlane → issue, plus tags,
  contributors, fields, comments, notes, attachments, collab messages).
- **Determinism.** Replay of the same event set at the same schema version is
  deterministic; ULID ids give causal ordering; wall-clock time is never the
  ordering source (`effectiveEventTimes` handles poisoned timestamps).
- **Dedupe on read.** `sortEvents` places each eventId once; duplicate lines
  (see the production anomaly in `TEST_BASELINE.md`) are collapsed at
  materialization, which is why the board renders correctly despite them.

## Write path (crash safety)

1. `event-write` applies the event in memory and appends the line to the
   actor's **pending** file (`<actorId>~pending.jsonl`) first
   (`pending-log.ts: appendPendingLine`).
2. `flushPendingLogs` moves pending lines into the tracked
   `<actorId>.jsonl` and the state branch commit publishes them.
3. A killed process leaves `~pending` lines behind; the next boot/sync
   flushes them. One such file exists in production (homelab board, pi,
   2026-11-10).

## Sync lifecycle (`source/git/`)

- **Locking.** `sync-lock.ts`: `ome-sync.lock` in the state git dir.
  `acquireSyncLock` / `withSyncLock` classify the holder `clean | dead |
stale`; a dead holder's lock is taken over. The lock is what lets recovery
  distinguish a live rebase from a crashed one.
- **Stale git locks.** On sync start, `sync.ts` clears `.lock` files left by
  dead processes in the state worktree and the common dir (`index.lock`,
  ref locks), except its own.
- **Interrupted rebase.** A stuck rebase is **aborted**, not `--quit`:
  abort returns to pre-rebase HEAD which still carries every local commit, so
  the pull restarts the rebase cleanly.
- **Event logs survive git operations.** `withEventLogsIntact`
  (`sync.ts:664`) snapshots the event logs before handing the worktree to
  git, and `log-integrity.ts` (`assertLogOnlyGrew`,
  `restoreDroppedEventLines`, `findStrandedEventLogs`) verifies afterward
  that no accepted line was lost.
- **Sync is on demand** (`ome sync` / `ome_sync`); no other path touches the
  network. Auto-sync is configurable (`set-auto-sync`).

## The IdOrRef surface (structural review)

`idOrRef` (full ULID or 7-char ref) is accepted at three hand-rolled sites:
`mcp/api/issues.ts` (full scan, suffix match), `mcp/ome-issue-stats.ts`
(length guess), and internal callers that pre-compute `nodeRef(issueId)`
(`gui/api/lib/websocket.ts`, `mcp/api/swimlane-stats.ts`). The ref is
`id.slice(-7).toUpperCase()` (`lib/utils/node-ref.ts`), with tolerant
matching (hyphens, case, suffix). Problems and the rebuild target: one
address space, one resolver, index-backed. Full review in `DESIGN.md` §3.

## Concurrency model (as built)

- One writer per actor log (the owning process); MCP mutations are serialized
  through `exclusiveTool`/`runExclusive` in `mcp/server.ts`.
- Cross-machine: git rebase of the state branch; conflicts are resolved by
  the event-forest merge (union of event sets), not text merge.
- No leases or claims in the model today; assignment is a plain
  `add.issue.assignee` event with no expiry. (This is the gap the rebuild's
  Lease entity closes; see `DESIGN.md` §8.)
