# Cairn (working name) — Design Document

> Aligned design for the OME rebrand and rebuild. Written 2026-11-15 on branch
> `research/rebrand-rebuild`. This document is the single place where the
> operator requests, the OME_NEXT.md vision, the current codebase, the upstream
> port, the competitor research, and the 3 months of OME board logs all agree.
> Where sources disagree, this document says which source wins and why.
>
> Sources, newest first:
>
> - `OME_NEXT.md` (operator-provided product vision, 2026-11-15) — the rebuild brief.
> - `docs/VISION.md` (operator-only, 2026-10-10 / 2026-10-12) — prior product direction.
> - Operator session requests, 2026-11-15 (structural review, upstream port, rename,
>   `mcp` bridge prefix, rebrand, hadal lane).
> - Baseline recon performed 2026-11-15 (this session), recorded in `research/EXECUTION_LOG.md`.

## 1. Where we are (verified 2026-11-15)

| Fact              | Value                                                                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository        | `T-Crypt/oh-my-epiq`, public                                                                                                                                                                         |
| Working baseline  | `main` @ `6eb002d4` (merge of PR #38, GUI overhaul)                                                                                                                                                  |
| Fork base         | Epiq v1.12.4 (`base-vendor`, tag `5fdc5110`)                                                                                                                                                         |
| Upstream HEAD     | `ljtn/epiq` @ `d66d1db7` (v1.17.1, 2026-11)                                                                                                                                                          |
| Upstream distance | 246 commits, 640 files, +38,768 / −14,270 lines                                                                                                                                                      |
| Package           | `oh-my-epiq` 1.13.0, MIT, Node >= 18, ESM, TypeScript                                                                                                                                                |
| Surfaces          | CLI `ome`, TUI, browser board `ome gui` (OMP shell, remote access), MCP `ome-mcp` (19 tools by default, 36 with `OME_MCP_FULL=true`; `ome_state_get` and `ome_contributor_email_*` never registered) |
| State             | Append-only event log per user, git-synced on `__ome_state__` worktree at `~/.ome-global/worktrees/<projectId>`                                                                                      |
| Local boards      | 12 registered projects; 5 with active worktrees                                                                                                                                                      |

The MCP surface today: `ome_issue_*` (get, list, create, update, close, reopen,
stats, note*\*, comment*_, attachment*add), `ome_swimlane*_`, `ome*board*_`,
`ome*tag*_`, `ome*contributor*_`, `ome*collab*_`(the agent collaboration
board),`ome*actor_assume`, `ome_sync`, `ome_project_init`, `ome_skill_install`.
`ome_state_get`and`ome_contributor_email*\*` exist as functions but are not
registered (agents never call them; the GUI uses the functions directly).

## 2. What the last 3 months of OME logs say

The homelab board is the only heavily used board: 2,070 events since 2026-08-15,
356 tickets, 13 contributors (agents: claude, opencode, pi, comfy-impl-1014,
plus tcrypt/trevin). Event mix:

| op                 | count | signal                                                                                                                                        |
| ------------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| add.issue.tag      | 580   | Tags carry all organisation. 1.6 tags per ticket, and they do the job that priority and goal axes should do.                                  |
| edit.description   | 359   | Agents rewrite descriptions constantly. No structured spec/instructions field, so intent lives in free text and gets churned.                 |
| add.issue          | 356   | Steady intake.                                                                                                                                |
| add.issue.comment  | 288   | Discussion is in comments. Fine.                                                                                                              |
| add.issue.assignee | 262   | Assignments are sticky: 262 adds, **1 remove** in 3 months. There is no release, no handoff, no lease. An assigned ticket is claimed forever. |
| move.node          | 77    | Lanes move, but with 3 swimlanes + Ideas they carry no lifecycle meaning.                                                                     |
| close.issue        | 45    | 12.6% closure rate. Tickets accumulate. Nothing forces an evidence-backed close.                                                              |

Structural findings from the same logs:

1. **A pending event file exists** (`7jpc6rp6…~pending.jsonl`): an actor's
   events (pi, 2026-11-10) that were never published to the state branch.
   Interrupted sessions leave unpublished work. Recovery exists in
   `source/git/sync.ts`, but the operator has to notice.
2. **Actors are contributors, not sessions.** 13 contributors, several of them
   agent harnesses. The log records who, not which session, which machine, or
   what the session attempted. Two sessions of the same harness are
   indistinguishable.
3. **The board is a per-project single view.** 12 registered projects, 5
   active, no cross-project view (matches the portfolio gap in VISION.md and
   upstream issue #428).
4. **No readiness concept.** Nothing in the model says a ticket is blocked or
   ready. Readiness is inferred by the agent from prose.

These four findings are the strongest local evidence for the OME_NEXT P0 list:
leases (2), execution/session records (2), evidence-backed completion (4, and
the closure rate), and the readiness graph (4). The logs are a guide, not a
spec: they say where agents stumble today, and they do not by themselves
choose the storage engine or the entity model.

## 3. Structural review: why we use IdOrRef

`IdOrRef` is not a single type. It is a string-argument contract: a field named
`idOrRef` that accepts a full 26-char ULID or the 7-char ref, and writes
additionally accept a name.

What the ref is (`source/lib/utils/node-ref.ts`): the **last 7 characters of
the node id, uppercased**. Matching (`nodeRefMatches`) is tolerant: it strips
hyphens, lowercases, and matches a suffix, so `5jzcs5m`, `5JZ-CS5M`, and `zcs5`
all resolve.

Why it exists. Agents see refs everywhere the UI renders (list rows, board
cards, commit subjects carry the ref per our convention) and full ids in
payloads. The documented stumble (VISION.md, MCP revitalisation) was: only
`issue_get` accepted the ref, writes looked up the raw token and returned
"Issue not found". IdOrRef is the ergonomic bandage for agents hand-slicing
ids.

The structural problems:

1. **It is a per-endpoint convention, not a resolver.** Three call sites parse
   it by hand: `source/mcp/api/issues.ts` (full scan of every non-deleted
   ticket, filter on suffix match), `source/mcp/ome-issue-stats.ts`
   (length-based guess, `> NODE_REF_LENGTH`), and internal callers that must
   pre-compute `nodeRef(issueId)` before calling `getIssueStats`
   (`source/gui/api/lib/websocket.ts`, `source/mcp/api/swimlane-stats.ts`).
   The same idea is implemented three different ways.
2. **Ambiguous input costs a full scan.** `issue_get` with a 7-char ref walks
   every ticket node on the board. Fine at 356 tickets; wrong as a design
   property.
3. **The ref is a derived suffix slice, not a guaranteed-unique key.** Two
   nodes can share a 7-char tail; there is no uniqueness check and no
   collision path in the resolver.
4. **The three notations are asymmetric.** id + ref on reads, id + ref + name
   on writes. An agent has to know which endpoint accepts which form.
5. **It leaks into internal APIs.** `getIssueStats({idOrRef})` is an internal
   function whose caller must know the notation rules. Internal code should
   hold ids only.

Target in the rebuild. One address space, one resolver:

- A stable, human-readable short id is the **primary** notation everywhere
  (display, commit subjects, MCP arguments). Long ids are the storage form.
- One typed `WorkRef` with a single resolver (id → node, short id → node,
  name → node), backed by an index, O(1) lookups, explicit error on collision
  or miss. Every surface (CLI, TUI, GUI, MCP) resolves through it.
- IdOrRef disappears as a concept. This is the first concrete deletion the
  rebuild makes against the Epiq-inherited model, and it is the template for
  the rest of the divergence.

## 4. Upstream port (v1.12.4 → v1.17.1)

246 commits. The content, from the commit stream:

- **Goals**: a new first-class axis. A goal strip on the timeline, goals as a
  board filter axis, goal progress, goal panels, ticket goal labels (about 25
  commits, v1.15/v1.16).
- **Filters**: tag, contributor and goal filters, lane counts under filters,
  filter-clear behaviour, board switcher counts.
- **Markdown tables** in diff rendering; quieter diffs (line tint, diff pills,
  commit rows).
- **Timeline** filter labels and behaviour; commit-row refinements.
- **MCP**: `short-refs.test.ts` (upstream adopted short-ref support,
  confirming our IdOrRef direction), a rewritten `timeline-index.ts`, tool
  list tests, boot settings.

Strategy decision. **Port on an isolated branch; do not build the rebuild on
the port.**

- Branch `port/upstream-1.17.1` from `main`. Mechanical pass: apply upstream,
  re-apply the `epiq` → `ome` rename map (module names, env, paths, state
  branch, tool names) per AGENTS.md, run `tsc --noEmit`, `build:npm`, vitest.
- The port keeps a _shippable_ product alive while the rebuild happens on
  `rebuild/integration`, and it is the source of truth for what upstream
  considers a good model (Goals, filters, ref support).
- The rebuild **adopts the concepts** (goals, filter axes, ref-first ids) and
  does not inherit the code. Porting 39k lines and then deleting them is waste;
  porting and never deleting is the status quo. The rebuild's entity model
  gets a `Goal`/objective axis from day one because upstream just proved the
  need on our own board (580 tag events doing job of an axis).

## 5. Competitive snapshot (evidence pass, 2026-11-15)

| Project             | License    | Last push  | Stars | Standing                                                                                                                                                                                                             |
| ------------------- | ---------- | ---------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gastownhall/beads   | MIT        | 2026-11-15 | 28.7k | Active, fast. "A memory upgrade for your coding agent." Dependency graph, ready-work detection, atomic claims, Dolt-backed versioned data.                                                                           |
| BloopAI/vibe-kanban | Apache-2.0 | 2026-11-15 | 28.7k | Active. Agent workspaces, git worktrees, multi-agent adapters, diff review. (OME_NEXT.md claims a sunset note; the live README shows no such banner as of today. Verify in Phase 1; do not depend on it either way.) |
| git-bug/git-bug     | GPL-3.0    | 2026-11-15 | 10.9k | Active. Distributed offline-first, git-integrated. **GPL boundary: study only. No code into an MIT codebase without a written compatibility review and operator approval.**                                          |
| MrLesk/Backlog.md   | MIT        | 2026-11-11 | 7.4k  | Active. Markdown-native specs, spec/plan/code checkpoints, CLI + local web UI + MCP. Same author as groma.md.                                                                                                        |
| ljtn/epiq           | MIT        | 2026-11-14 | 0.6k  | Active. Our base. Small community, steady releases (1.12.4 → 1.17.1 in ~3 months).                                                                                                                                   |
| MrLesk/groma.md     | MIT        | 2026-11-15 | 0.5k  | Active. C4 architecture map in OKF markdown, task-to-component links. Adjacent study for the task-to-code mapping (P1).                                                                                              |

Takeaways that hold before the deep Phase-1 teardowns:

- **Beads is the direct competitor** and it validates the OME_NEXT thesis:
  ready-work detection, atomic claims, and durable agent memory are what the
  market is moving to. Our differentiators (H2–H5 in OME_NEXT.md: context
  capsules, agent-neutrality, evidence freshness) must be tested against
  beads' actual features in Phase 1, not assumed.
- **Nobody owns "evidence freshness"** (H4) as a first-class concept; this
  remains a potential gap until Phase 1 proves otherwise.
- **git-bug's offline-first object model is the architecture reference** for
  our sync design; the license keeps it at arm's length.
- **Backlog.md + groma.md** are the reference for markdown-native specs and
  task-to-component links, both MIT, both small, both studyable in depth.

## 6. The hadal lane: the product as model-improvement substrate

The operator's framing: **hadal is the agent harness; the new product exists
to improve the model, not just to track issues.** The board is one view of a
system whose real output is _better runs over time_.

Lane model. One product, five lanes. hadal owns the first and last; the middle
three are product core.

1. **Tracking** (product): work items, goals, constraints, readiness.
   The old OME job, kept.
2. **Coordination** (product): claims, leases, handoffs, actor + session
   identity. What the 3-month logs show is missing (262 assigns, 1 release).
3. **Execution** (product): the ledger. Every session records actions,
   observations, attempts, diffs, command results with repository revision,
   environment fingerprint, and validity state.
4. **Evidence** (product): completion requires linked, fresh verification.
   The 12.6% closure rate ends when close means "evidence attached".
5. **Learning** (hadal): hadal reads the ledger and the stumble patterns and
   improves the harness. This is where "improve the model" lives.

How hadal plugs in. hadal is a first-class **agent identity** in the product
(`provider/name` becomes `harness/model@machine`), already the shape of
`ome_actor_assume`. Its lane:

- hadal sessions claim work through the lease lane (no more sticky
  assignee).
- hadal writes execution records through the MCP/CLI (record, not intercept:
  the product does not wrap the model and does not run it).
- The product exposes a **stumble query**: repeated failures, stale-result
  reuse, re-claimed work, pending events, context-reconstruction cost per
  session. This is a deterministic projection over the ledger, no LLM.
- hadal consumes the stumble query and the context-capsule misses (what a
  session had to re-derive that the capsule should have carried) and updates
  its own memory, skills, and prompt templates. The loop: **board records the
  stumble → product projects the pattern → hadal fixes the harness → fewer
  stumbles on the next board.** The product measures the loop's effect
  (stumble rate per session, rework rate) and reports it on the board.

Non-goal held from `OME_NEXT.md` §15 and sharpened here: the product never
bundles a model, never runs a harness, and hadal's lane is read-mostly on the
product side (it reads projections and writes its own execution records).
"Improve the model" is hadal's job, done on evidence the product keeps.

## 7. Naming and rebrand

The rename must be "more unique than Oh-My-Epiq", work as a CLI, an npm
package, an MCP prefix, a data directory, and a state branch, and sit next to
`hadal` without colliding with anything in the lab (`strata`, `berth`,
`soteria`, `speculum`, `omarchy`, `aether-*`, `infrastructure` names all taken
or in use).

Candidates, checked 2026-11-15:

| Name                    | Why                                                                                                                                                                                                                                                                                                                                                                            | Risk                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Cairn** (recommended) | A cairn is stones stacked to mark the way for the next walker. It is the product in one word: every session leaves a stone (execution record), the next session reads the pile (context capsule). Short CLI `cairn`, strong verb ("cairn it"), clean logo, no major dev-tool collision. Pairs with hadal: hadal is where the work happens, the cairn is what it leaves behind. | npm `cairn` is taken (0.8.0, unrelated domain) — publish as `cairn-board` or a scoped name; the CLI and repo are not affected. |
| Anamnesis               | The medical act of recalling history before treatment. Maps 1:1 to the seven mission questions.                                                                                                                                                                                                                                                                                | Long, scholarly, weak CLI (`ana`/`anm`). npm taken.                                                                            |
| Mnemosyne               | Memory personified; the learning loop.                                                                                                                                                                                                                                                                                                                                         | Long, and a 2004 spaced-repetition tool shares the name. npm taken.                                                            |
| Palimpsest              | Rewritten manuscript, old layers still readable. Fits the event-log + rebuild story.                                                                                                                                                                                                                                                                                           | Four syllables, no verb. npm taken.                                                                                            |
| Pelagic                 | Open-ocean zone; keeps the hadal ocean family.                                                                                                                                                                                                                                                                                                                                 | Reads as a fish product. npm taken.                                                                                            |

**Decision (gate): working name `Cairn`** pending operator confirmation. If
Trev rejects it, Anamnesis is the fallback. Everything below uses `cairn` /
`CAIRN`; the map is mechanical.

Rebrand map (full rename, from OME to Cairn):

| Thing              | OME today           | Cairn                                                                             |
| ------------------ | ------------------- | --------------------------------------------------------------------------------- |
| npm package        | `oh-my-epiq`        | `cairn-board` (or scoped)                                                         |
| CLI / bins         | `ome`, `ome-mcp`    | `cairn`, `cairn-mcp`                                                              |
| MCP tool prefix    | `ome_*`             | `cairn_*`                                                                         |
| Data dir           | `~/.ome-global`     | `~/.cairn`                                                                        |
| Project descriptor | `.ome/project.json` | `.cairn/project.json`                                                             |
| State branch       | `__ome_state__`     | `__cairn_state__`                                                                 |
| Env vars           | `OME_*`             | `CAIRN_*`                                                                         |
| GUI assets/mark    | OME wordmark        | Cairn mark (stone stack, square, mono, Tokyo Night — OMP posture per house style) |

Rebrand mechanics. The rebrand is not a find-replace; it lands in two moves:

1. **The port branch** (`port/upstream-1.17.1`) keeps the `ome` name. It is a
   compatibility release, still recognizable as the OME line.
2. **The rebuild branch** (`rebuild/integration`) is written as Cairn from the
   first commit: new module names, new entity types, no `epiq` or `ome`
   identifiers in the core. "Change it enough that it is no longer just Epiq
   base" is achieved **by the rebuild, not by renaming functions in the old
   tree**. Renaming functions in place keeps Epiq's architecture wearing a new
   name; that is the wrong kind of rebrand and it does not survive contact
   with Phase 4.

Legal posture (unchanged by the rename): MIT attribution stays. The stacked
LICENSE (2025 Jonatan Lampa + contributors) and UPSTREAM.md remain; any file
that survives from Epiq or OME keeps its copyright notice. The rebuild
diverges until the shared ancestry is thin; when a module is a clean-room
rewrite it carries the new header with the original attribution in the
project-level license inventory, never a per-file erasure. No attribution is
removed anywhere (house rule and AGENTS.md).

MCP bridge and the `mcp` prefix. HADAL bridges MCP tools as
`xd://mcp__<tool_name>`, so the bridge address already carries the `mcp__`
prefix; the rename changes only the server segment: `xd://mcp__ome_issue_get`
becomes `xd://mcp__cairn_work_get` (tool renames in §9.3). The bridge
registration update is a write to the HADAL `xd://` device, i.e. it goes
through the HADAL app data, never by hand-editing `~/.hadal`. Note for
execution: the `xd://` device registry was not locatable in the `hadal-live`
source or docs checked out on this machine (searched 2026-11-15). The bridge
rename is scheduled against Phase 5 (agent integration) and needs the device
location confirmed by the operator or a HADAL-side search.

## 8. Target architecture

From OME_NEXT.md P0, kept as the core. The storage judgment is settled here at
design level; the proof happens in Phase 3 spikes per the brief.

**Source of truth: keep the git-backed append-only event log. Add a local
indexed projection. This is the hybrid candidate from OME_NEXT.md §9.1, and
the only candidate that survives the constraints without new risk.**

- The event log already solves: portability, offline, audit, history, replay,
  multi-machine sync via git, zero server. It has 3 months of production
  history on real boards. Replacing it is the largest single risk in the
  project and the benchmarks do not yet justify it.
- The log's real weakness is query: full-scan resolution (the IdOrRef
  problem), no readiness computation, no ledger queries. That is an index
  problem, not a storage problem.
- The projection is a local SQLite (WAL) database: node index, relationship
  index, lease state, ledger index, capsule cache. Rebuildable from the log
  at any time, digest-checked, never the source of truth. SQLite's
  single-writer and same-host WAL constraints match the deployment (one
  machine writes its own projection; git carries the log between machines).
- Dolt: benchmarked in Phase 3 as the sync-collaboration candidate, expected
  to lose on operational footprint; recorded either way.

Core entities (P0 subset, naming settled):

| Entity     | OME_NEXT source         | Note                                                                                                                                                                                      |
| ---------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------- | ------------ | ------- | ------------- |
| `Goal`     | Objective               | Ships because upstream v1.17 just added the same axis. Success measure, owner, status.                                                                                                    |
| `Work`     | Work item               | The ticket, re-typed. Spec, acceptance criteria (structured, not description prose), priority.                                                                                            |
| `Relation` | graph relationships     | Typed: `depends_on`, `blocks`, `parent_of`, `relates_to`, `implements`, `supersedes`. Allowed types, cardinality, cycle detection per §5.2 of the brief.                                  |
| `Lease`    | Lease                   | Atomic claim, fencing token, expiry, heartbeat, recovery. Shared work (research, review) is a separate mode, not a lease.                                                                 |
| `Session`  | Session + Execution     | Actor + harness + model + machine + start/end + outcome. hadal sessions are ordinary sessions.                                                                                            |
| `Record`   | Execution ledger        | Actions and observations with repository revision, env fingerprint, input/output digests, validity state (`valid                                                                          | stale | superseded | contradicted | unknown | unverified`). |
| `Evidence` | Evidence + Verification | Linked to the acceptance criterion it proves. Freshness = record of what it depends on; invalidation is deterministic (relevant revision changed, env changed), never a model judgment.   |
| `Capsule`  | Context capsule         | Projection, not stored state: assembled from Goal + Work + relations + fresh Records + open questions, under a caller token budget, deterministic order, source references on every line. |

Readiness. `ready(W)` = all `depends_on` satisfied + no open `blocks` + lease
policy permits + required context present. Computed, never stored, always
explainable ("why ready / why blocked" is a first-class CLI and GUI answer).

MCP surface target (Phase 5 detail; ~10 tools, `cairn_` prefix):
`cairn_work_ready`, `cairn_work_show`, `cairn_work_create`, `cairn_work_update`,
`cairn_claim`, `cairn_release`, `cairn_handoff`, `cairn_context` (capsule,
`--budget`), `cairn_record` (execution records), `cairn_evidence`,
`cairn_verify`, `cairn_goal_*` (list/show/update), `cairn_sync`,
`cairn_actor_assume`. One resolver (§3) behind every id argument. Default
responses small; `--full` retrieves depth.

## 9. Roadmap (aligned)

Phases follow OME_NEXT.md §12 with the port and rebrand folded in. Each phase
ends with its exit gate; no phase skips ahead.

| Phase | Content                                                                                                              | Branch                     | Status                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| 0     | Baseline, inventory, test run, `research/` structure                                                                 | `research/rebrand-rebuild` | This document + EXECUTION_LOG is the start                                |
| P     | **Upstream port v1.17.1** (new, this design)                                                                         | `port/upstream-1.17.1`     | Next; mechanical, tested, released as the last `ome_*` compatibility line |
| 1     | Competitor teardowns (beads first, then Backlog.md, vibe-kanban, git-bug study, epiq delta)                          | research only              | After P                                                                   |
| 2     | Product spec: domain model, workflows, ledger spec, capsule spec                                                     | research only              |                                                                           |
| 3     | Spikes + ADRs: graph/readiness, leases, ledger validity, capsules, evidence freshness, two-clone sync, OME migration | `rebuild/spike-*`          |                                                                           |
| 4     | Core rebuild, written as Cairn (new tree, new types, hybrid storage)                                                 | `rebuild/integration`      |                                                                           |
| 5     | Agent integration: `cairn_*` MCP, CLI contract, hadal lane live, **xd:// bridge rename**                             | `rebuild/integration`      |                                                                           |
| 6     | GUI/TUI redesign around Work / Graph / Runs / History                                                                | `rebuild/integration`      |                                                                           |
| 7     | Migration: `ome migrate` → `cairn migrate` path, dry-run, rollback, real-board runs                                  | `rebuild/integration`      |                                                                           |
| 8     | Release: name lock, package, new repo (new repo + public release need explicit operator approval per the brief)      | —                          |                                                                           |

Execution queue for the next sessions (from OME_NEXT.md §19, updated):

1. Finish Phase 0: full test baseline (`tsc`, `build:npm`, vitest; e2e needs
   the node-pty rebuild per house notes), architecture map, CLI/MCP surface
   inventory into `research/baseline/`.
2. Open `port/upstream-1.17.1`, port, re-apply the rename map, green tests,
   tag it.
3. Clone the Priority-A set to `~/ome-research/sources/` (pinned commits,
   licenses recorded) and start the beads teardown.
4. Confirm the `xd://` device location with the operator (not found in the
   hadal-live checkout).
5. Operator gate: confirm the name (Cairn / Anamnesis / other).

## 10. Decisions and gates

Decided here (reversible, in-plan):

- Keep the git event log as source of truth; SQLite projection on top.
  (Phase 3 spikes can overturn this with evidence.)
- IdOrRef is deleted in the rebuild; one resolver, one notation.
- Port on its own branch; the rebuild adopts upstream concepts, not code.
- `Goal` ships in the P0 model (upstream validated the axis).
- hadal is a first-class agent identity; the learning lane reads
  deterministic projections only.
- git-bug stays study-only (GPL).
- Working name **Cairn**; npm `cairn-board` pending a registry check at
  release time.

Gates that stop work until the operator says otherwise (per OME_NEXT.md §2.1
and house rules):

- Final name lock.
- Merging the rebuild core into the protected baseline.
- Creating the new public repository; publishing the new package.
- Any git-bug code reuse (needs a written compatibility review).
- Destructive migration of the 12 live boards.

## 11. Open questions

1. **xd:// device location**: the bridge registry was not found in the
   hadal-live checkout or pocket docs (searched 2026-11-15). Needed for the
   Phase-5 bridge rename.
2. **vibe-kanban sunset**: the brief cites a sunset note; the live README
   (checked 2026-11-15) shows none. Verify in Phase 1; the roadmap does not
   depend on it.
3. **Lifecycle from VISION.md** (idea → parked phases): upstream's Goals axis
   plus the readiness computation covers most of it; the remaining question is
   whether lifecycle phases become `Goal` statuses or a `Work` status enum.
   Phase 2 decides; the brief's "single completion state plus verification
   state" leans.
4. **Capsule vs AGENTS.md context**: how much of the capsule is auto-injected
   into hadal's session context versus on-demand `cairn_context` calls. Phase 5.
5. **npm scope**: `cairn-board` vs `@<org>/cairn`. Release-time decision.
