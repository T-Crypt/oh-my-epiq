# Competitor matrix

Recorded 2026-11-16, Phase 2. Scores are 1–5 on the vision doc's §8
dimensions; `unknown` where the clone did not support a claim.
Inspected revisions (depth-50 clones, `~/ome-research/sources/`):

| Project | Revision | Date |
|---|---|---|
| Beads | `8cdfa79` (#8432) | 2026-11-13 |
| Vibe Kanban | `3f095f0` (#3507) | 2026-11-15 |
| git-bug | `f48b4e4` (#1764) | 2026-11-15 |
| Epiq upstream | `d66d1db7` (v1.17.1) | port branch `port/upstream-1.17.1` |
| OME (this repo) | `6eb002d4` (v1.13.0) | baseline docs |

Evidence for each score is in `competitors/<name>/TEARDOWN.md`,
`port/PORT_NOTES.md`, and `baseline/`.

## Scores

Legend: 1 weak/absent, 3 partial, 5 strong.

| Dimension | Beads | Vibe Kanban | git-bug | Epiq 1.17.1 | OME 1.13 |
|---|---|---|---|---|---|
| 1 dependency graph and readiness | 5 | 2 | 1 | 2 | 2 |
| 2 atomic claims, leases, crash recovery | 4 | 2 | 2 | 2 | 2 |
| 3 agent-neutral CLI/API/MCP quality | 5 | 4 | 3 | 4 | 4 |
| 4 task-specific context retrieval | 4 | 2 | 2 | 2 | 1 |
| 5 durable execution state, observation validity | 3 | 4 | 2 | 2 | 2 |
| 6 evidence-backed completion, verification freshness | 2 | 4 | 1 | 3 | 1 |
| 7 decision and constraint lineage | 1 | 1 | 1 | 1 | 1 |
| 8 human review of agent changes | 2 | 5 | 2 | 2 | 1 |
| 9 workspace and worktree isolation | 1 | 5 | 1 | 2 | 1 |
| 10 collaboration across machines / offline | 4 | 2 | 5 | 4 | 4 |
| 11 data portability, history, export | 4 | 3 | 5 | 4 | 4 |
| 12 UX quality, responsiveness, discoverability | 4 | 5 | 3 | 4 | 3 |
| 13 install footprint, operational complexity | 3 | 2 | 3 | 4 | 4 |
| 14 concurrency, performance, recovery evidence | 4 | 4 | 3 | 4 | 3 |
| 15 extensibility, integration cost | 4 | 4 | 2 | 4 | 4 |

## Notes per project

**Beads.** The only competitor with dependency-driven readiness as the
headline (`bd ready`, 30 ms at 10K). Claims are CAS transitions
(`assignee → me`), no TTL. MCP has progressive disclosure
(`discover_tools`/`get_tool_info`). Memory plane with
convergent-on-pull merge class. Weakest: no evidence model (status is
the verdict), no worktree isolation, no review surface.

**Vibe Kanban.** Strongest on execution and review: workspaces give
each attempt a worktree, branch, terminal, dev server; inline diff
comments become the next prompt; tracked PRs; attempt/turn/seen
bookkeeping; 10+ agent executors with ACP first-class. Weakest as a
shared board: single server + SQLite writer, org/team model, no
CRDT/offline merge. No dependency graph, no lease, no decision
lineage.

**git-bug.** The closest relative to OME: event-sourced entities,
offline sync over git remotes, Lamport clocks, DQL query language,
prefix id resolution "long enough to be unique". Weakest as an agent
work system: content-addressed ids make handles unstable, no agent
identity/session concept, no execution or evidence records, no review
surface, GPL (reuse is out by licence and by design).

**Epiq 1.17.1 (upstream).** Strongest recent movement: Goals axis,
repos-as-board-events, `Epiq-Ref` trailer, filter axes, CI stress gate
(400k events, <2 s read), compact MCP replies, descriptions riding
with assume/get. Still a board product: status is the verdict, no
leases, no execution ledger, no evidence freshness, no decision
lineage.

**OME 1.13 (this repo).** Inherits Epiq's board model and its gaps;
adds the OMP shell and remote access. Baseline defects recorded
(2 GUI failures, duplicate-write anomaly). The rebuild's job is to
close dimensions 5–8 while keeping 10–11.

## Cross-cutting read

Three dimensions have no competitor at 5 today: **decision/constraint
lineage (7)**, **observation validity (5)**, **evidence freshness
(6)**. Two have real competition: **readiness (1)** is Beads' home
ground, and **human review (8)** is Vibe Kanban's. This shapes the
opportunity analysis: differentiate on 5–7 (state that does not lie),
not on 1 (we adopt, we do not reinvent).
