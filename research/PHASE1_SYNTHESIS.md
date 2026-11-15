# Phase 1 synthesis — what the teardowns and the port changed in the design

Recorded 2026-11-15, Phase 1 close. Inputs: `PORT_NOTES.md`,
`teardowns/BEADS.md`, `teardowns/VIBE_KANBAN.md`, `teardowns/GIT_BUG.md`.

## Decisions confirmed by evidence

1. **Hybrid storage (log + SQLite projection)** — confirmed three
   ways: upstream deleted its Postgres/MySQL adapters to stay lean
   (beads, same decision); vibe-kanban runs a flat SQLite + indexes
   at real load; our own baseline shows replay is not the bottleneck
   (9.8 ms at 2,070 events), so the projection is a query shape, not
   a storage rescue. No server database, ever.
2. **IdOrRef → one resolver, short prefix, unique-or-error** —
   git-bug proves the prefix-resolution UX ("long enough to be
   unique, like a git hash"); beads proves 3-char suffixes resolve
   fast at 10K. OME keeps the 7-char ref and the ULID, and gets one
   resolver.
3. **Goals axis in P0** — upstream shipped it, filters on it, and its
   skill tells agents to start bigger work with a goal. The rebuild's
   `Outcome` entity is the goal axis plus acceptance criteria;
   upstream validates demand, the rebuild adds the acceptance.
4. **Repos-as-events** — upstream moved repo connections from
   `project.json` to `connect.repo`/`edit.repo`/`disconnect.repo`
   board events, with previewed connects and fetch-only URLs. The
   rebuild's connected-repo concept inherits that event model.
5. **Lease = CAS claim + expiry** — beads proves CAS-only claim
   semantics work (no TTL), and is mid-proposal generalizing to a
   full compare-and-set. The rebuild adds the expiry the brief
   demands (stalled work reclaimable); both mechanisms compose.
6. **Agent surface: progressive disclosure** — beads'
   `discover_tools`/`get_tool_info` pattern (names + one-liners
   first, full schema on demand) is adopted for the rebuild's MCP
   surface; it cuts per-tool context cost, which the brief cares
   about.

## Decisions changed or sharpened

7. **A small qualifier query language (DQL-shaped) over the
   projection**, new in this phase: `status:… tag:… assignee:…
   sort:…` on the SQLite projection. This is how the readiness query
   (DESIGN.md §8) and the stumble query stop being one-off tools and
   become composable slices. Small qualifier set, no grammar.
8. **Attempt/turn/seen bookkeeping on record types**, from
   vibe-kanban: an `Outcome`'s acceptance and a `Rehearsal`'s verdict
   get named attempts, human-seen flags, and review-shaped feedback
   (inline, per-item, the input to the next attempt). The rebuild
   stores that feedback as board events; it never pipes it to an
   agent (that is hadal's lane).
9. **Operations as addressable entities** for the new record types
   (from git-bug): a state change on an Outcome or Insight is
   referenceable, not just re-readable from the log.

## What stays out of the rebuild (with a named reason each)

- Dependency graph as primary object (beads) — board-first, not
  blocker-first; `blockedBy` stays an edge.
- Embedded agent execution (vibe-kanban) — hadal's lane, not the
  product's; the product keeps the records hadal works from.
- Dolt / entity-version-in-git (beads, git-bug) — git already
  versions the log; a second versioning layer is redundancy.
- Content-addressed ids (git-bug) — breaks stable handles and the
  one-id-one-bytes append invariant.
- Lamport side-store (git-bug) — the id-embedded clock merges for
  free.
- GraphQL fourth door (git-bug) — MCP + CLI + GUI is the surface; a
  fourth API is a fourth guard to break.
- Single-writer server model (vibe-kanban) — the board must merge
  across machines with no server.

## Work items fed into later phases

- **P2 (architecture):** the projection schema must carry:
  short-ref index (unique), prefix index, qualifier columns
  (status/tag/assignee/board/lane/goal), attempt/seen fields on
  record types. Draft it against the 400k-event, 2-second-read bar
  (upstream CI, DFRBSSJ).
- **P3 (storage spike):** benchmark the projection against the
  upstream 400k-event stress test, not our own invented bar.
- **P5 (surface):** MCP tool list with `discover`-style progressive
  disclosure; DQL qualifier filters exposed as one tool, not one
  per combination; short-ref-only in all tool replies.
- **Regression list additions** (on top of the two GUI failures
  found in Phase 0): every order-sensitive string assertion (the
  `git-safety` sort-order bug the rename surfaced) and every
  fixture that pushes to `main` (agent-git-guard interaction,
  documented in `PORT_NOTES.md`).
