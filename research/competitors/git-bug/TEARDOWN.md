# Teardown — git-bug (git-bug/git-bug)

Recorded 2026-11-15, Phase 1, from `~/ome-research/sources/git-bug`
(depth-50 clone of main). Go. The closest competitor to OME
architecturally: **event-sourced entities on git with logical clocks
and a query language**.

## 1. Issue model

- `Bug{*dag.Entity}`: a bug is an entity in a content-addressed DAG
  (`entity/dag`). Its state is the fold of **operations**:
  `op_create`, `op_set_title`, `op_set_status`, `op_add_comment`,
  `op_edit_comment`, `op_set_metadata`, `op_label_change`
  (`entities/bug/`). Each op is itself an addressable entity.
- Snapshots exist for fast reads (`entities/bug/snapshot.go`), so the
  hot path does not re-fold the whole op chain per read.
- Identity is its own entity namespace (`entities/identity`), resolved
  lazily through resolvers (`entity/resolver.go`) — an id is a
  reference, and resolution is pluggable.

## 2. Id model (the opposite pole from OME)

- **`Id = sha256(serialized entity)`** — content-addressed. Any change
  to an entity mints a new id. Human form: first 7 chars.
- `CombinedId` interleaves a primary and a secondary id (version
  references that carry both sides in one addressable token).
- **No time in the id.** Ordering does not come from the id.

**Read:** content addressing makes every state change a new address —
powerful for integrity, wrong for handles: a ticket that is edited
100 times keeps one id in OME, gets 100 ids here. The rebuild keeps
**stable ticket ids + event addresses** (OME's shape). What git-bug
validates is the **7-char human prefix** as the working address and the
prefix-resolution rule below.

## 3. Ordering: Lamport clocks, persisted beside the DAG

- Ordering is a **Lamport logical clock** (`util/lamport`), persisted
  as **files** in local storage (`repository/clocks_persisted.go`,
  under `clocks/`).
- The DAG structure (git commits with multiple parents) carries
  causality; the clocks order the non-causal.

**Read:** a validated *alternative* to OME's id-embedded hybrid
logical clock. The trade-off is explicit: git-bug pays for a second
store (the clock files) that must survive every merge and rebase and
reconcile on pull; OME's clock-in-id costs nothing to merge because it
travels with the event. The rebuild keeps the id-embedded clock. The
Lamport file store is a data point, not a pattern to copy.

## 4. Storage: everything is a git object

- The store **is** a git repository (go-git implementation,
  `repository/gogit.go`): entities are written as git trees,
  `StoreCommit(treeHash, parents...)` builds the DAG.
- `bridge/` handles push/pull between repos (with token auth), so
  "distributed" = git remotes of the entity DAG, not a server.
- Contrast with OME: OME stores only the **event log** in git and
  materializes in memory; git-bug stores **every entity, every
  version** in git. git-bug trades disk and read-amp for
  whole-repo inspectability (any state is `git log`-able).

**Read:** for the rebuild's scale (thousands of events, not millions
of entity versions), OME's log-only-in-git is the leaner choice and
already proven on the homelab board (2,070 events, 9.8 ms replay).
No change.

## 5. Indexing and the query language (the part worth stealing)

- **DQL**: a first-class query language with its own lexer and parser
  (`query/lexer.go`, `parser.go`). Qualifier syntax:
  `status:open author:"René Descartes" sort:edit`. Case-insensitive,
  combinable, quoted values.
- **Prefix id resolution, "long enough to be unique, similar to git
  commit hashes"**: `participant=9ed1a` matches whatever ids that
  prefix uniquely names. Ambiguity is an error, not a guess.
- Sort by id, creation time, edit time.
- A **GraphQL API** sits on top (`api/graphql`, gqlgen), plus web UI
  and TUI.

**Read:** the two details that transfer directly. (1) **Prefix
resolution with a uniqueness check** is exactly the rebuild's
IdOrRef fix (DESIGN.md §3): one resolver, short prefix, unique-or-error,
no board scan. git-bug proves the UX at a product scale. (2) **A small
qualifier query language** on top of the projection is the right
answer to "agents need ad-hoc slices" without a tool per combination:
`ready AND tag:critical AND assignee:hadaL` is a query, not a tool.
The rebuild's P1 projection gets DQL-shaped filters (qualifiers +
sort), not a full grammar.

## What the rebuild takes from git-bug

1. Prefix-id resolution with a uniqueness check, as the single
   resolver contract (short ref is the working address; full id is
   the durable one).
2. A small qualifier query language over the projection
   (`status:… tag:… assignee:… sort:…`), the surface agents use for
   readiness and stumble queries.
3. Snapshot-for-reads alongside the event fold, if replay cost ever
   shows (baseline says 9.8 ms at 2,070 events — not yet, but the
   400k CI bar from upstream says "watch it").
4. Operations as addressable entities for the record types (an
   Outcome's acceptance change is referenceable, not just re-reading
   the log).

## What the rebuild does NOT take

- Content-addressed ids (breaks stable handles; breaks the
  "one id, one byte sequence" append invariant in a different,
  worse way).
- Lamport clocks as a side store (the id-embedded clock already does
  the job at zero merge cost).
- Storing every entity version in git (read-amp and disk; the log
  is the record, the projection is the read path).
- GraphQL as the API (the rebuild's surface is MCP + CLI + the board
  GUI; a fourth API adds a fourth door to guard).
