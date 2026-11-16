# Port notes — upstream v1.12.4 → v1.17.1 (246 commits)

Recorded 2026-11-15, Phase 1. Branch: `port/upstream-1.17.1`
(`f48db959` = upstream `d66d1db7` + the OME rename map, tsc clean,
unit suite 2592/2592). Source of the analysis: `git log
base-vendor..upstream/main` (246 commit subjects) plus the diffed file
tree on the port branch.

## The seven axes upstream moved on

### 1. Goals — a first-class axis (23 commits)

- `#518`: tickets on any board belong to a goal, shown as progress
  pills with a goal panel and stats. `#522`: lanes carry rules and a
  panel; goals get a Code tab.
- A goal has a description, a ref, and closes with its last ticket
  (`#543`); it then moves to a closed list rather than vanishing.
- Goals are an **axis of the board filter** (`#568`), in place of the
  pill's funnel; switching board preserves tag/contributor/goal
  filters (`#576`).
- The skill tells agents "start bigger work with a goal" (`#532`) and
  defines what counts as done for a goal (`#527`).
- New files: `GoalDetails`, `GoalSection`, `GoalStrip`,
  `ManageGoalsModal`, `GoalMarks` in the GUI client; `goal.*` events in
  `board-events.model.ts`.

**Rebuild implication:** this is the strongest validation of the OME_NEXT
"Outcome" entity. Upstream proved the axis ships and is used; the rebuild
adopts the concept and adds what upstream lacks: outcome-level acceptance
(claims stay per-ticket, the outcome names its acceptance), and the hadal
lane reads goals as the unit of "bigger work" for its learning records.

### 2. Connected repos as board events (26 commits, the big one)

- `connect.repo` / `edit.repo` / `disconnect.repo` are **board events**,
  folded from the live log. **`project.json` is no longer edited** to
  manage repos; the repo tests seed board events instead of the project
  file.
- A connect is **previewed from a staged clone** (showing size and total
  cost to everyone), confirmed explicitly; only fetchable URLs are
  accepted — `file:///` paths are refused ("only what every contributor
  can fetch"), with a test escape `EPIQ_ALLOW_LOCAL_REPOS`.
- A connected repo **lends its commits, not its event log** — commits
  become board-visible (diff pills, Code tab) without merging repos'
  state.
- Read-mostly by design: a repo is "only read" in the settings panel; a
  refused repo change stays refused in the fold and readers filter it
  out; repo ids fold only scheme and host case.
- Clone isolation: git's kill handlers registered before spawn; no
  commit-graph or reflog a cancelled fetch could leave naming deleted
  commits; clones past 20 packs repack geometrically; a fetch undone at
  the cap puts back the default refspec it followed.

**Rebuild implication:** the rebuild's "connected repo" concept should
inherit this event model, not the fork's project-file model. It is the
right CRDT shape for "this board can see this code", and it is the
surface the Evidence/Insight entities will read (commits, diffs, test
results per repo).

### 3. Commit linking and diffs (47 commits — the largest bucket)

- The `Epiq-Ref: <ref>` trailer line is **recommended over a
  ref-prefixed subject** and must survive **any rebase or merge**, not
  only a squash (skill + AGENTS.md).
- A ticket's commits are found by **git's own search** (`git log
  --grep`-style), "not a full read of every history" (`#560`) — a
  direct answer to the OME log-scale problem, applied to the code side.
- Ticket diff totals "only the commits that name a ticket" (`#563`); a
  diff's cache key names its side, so "file added" and "same file
  deleted unchanged" are keyed apart.
- Diff rendering: half-strength tints, copy buttons on file names,
  opening a commit from a link folds the others and scrolls to it;
  markdown renderers built once.
- Markdown tables in descriptions render (remark-gfm); a body-marker
  nonce in the board's own git log so an author or subject starting
  with `B`/`E` is not mistaken for a body marker.

**Rebuild implication:** adopt the `Epiq-Ref`→(our name) trailer and the
git-search commit lookup. The OME fork's `commits/` module should be
re-verified against this — the fork is 246 commits behind on exactly the
module the rebuild needs.

### 4. Filters (13 commits)

- Board filter axes: tag, contributor, goal. Cards' names and tags
  narrow the board on hover (`JPGBYGK` dense/wide cards).
- The timeline separates **Filter commits** from **Filter board**
  (`#566`) — two distinct filter scopes, one for the code view, one for
  the board view.
- A lane the filter empties says how many tickets it hides, with a
  Clear (`#576`).

**Rebuild implication:** cheap to adopt wholesale; the readiness query in
`DESIGN.md` §8 builds on top of this.

### 5. Scale and CI (`DFRBSSJ`)

- **CI runs the stress test at 400k events and fails a read over 2 s.**
  Upstream has now codified the read SLO the rebuild's storage spike must
  also meet: <2 s at 400k. Our Phase 3 spike should benchmark against
  this exact bar and this exact test.

**Rebuild implication:** the projection decision (SQLite) is judged
against: 400k events, <2 s read, on this machine's hardware.

### 6. MCP and agent surface (9 + 8 commits)

- MCP replies are **compact and name every node by its short ref**
  (`#531`); the tool list carries no `$schema` line; lists are brief by
  default; `create` no longer echoes the description (`#539`).
- Boards and lanes take a **description** through the MCP, "handed to
  agents on assume, get, create and move" (`0KQT1XV`) — context rides
  with the identity and the work, exactly the OME_NEXT context-riding
  thesis.
- `epiq-mcp` runs React's **production** build (`NODE_ENV` set before
  imports; both bins in one split bundle) — a real fix to the 322 ms
  handshake cost we measured in Phase 0.
- Scoped agent names: a scoped name draws as its last part, `/sam`
  (`F7CKQ7J`) — a first step toward the `harness/model@machine`
  identity in `DESIGN.md` §6.
- The skill got **shorter and plainer** (`6FC0X9J`); agent guidance
  lives in `AGENTS.md`, imported by `CLAUDE.md` ("always loaded and read
  by any tool").

**Rebuild implication:** inherit the compact-response convention and the
description-riding; the identity model in `DESIGN.md` §6 generalizes the
scoped-name step upstream already made.

### 7. Sync hardening (28 commits)

- "Sync publishes a state branch that was never pushed" (`#538`) — a
  recovery for the unpublished-state class we found in Phase 0
  (the unflushed pending log on the homelab board).
- Pid start-time and boot checks are "asked for by the linked repos'
  locks alone" — the lock protocol extended to connected repos.
- A remove holds across worktrees: "its tombstone is never swept, a
  mark is never written through a link" (`H9SEJN2`).

**Rebuild implication:** the tombstone discipline upstream hardened is
exactly the invariant the rebuild's `Tombstone` entity must keep.

## What the fork is behind on (gap list)

Verified by diffing `main` (fork, 1.13.0) against the port branch:

1. **Goals axis** — absent in the fork entirely.
2. **Repos-as-events** — the fork still edits `project.json`.
3. **Filter axes** — the fork's board filter is the older pill/funnel.
4. **`Epiq-Ref` trailer + git-search commit lookup** — the fork
   predates both.
5. **400k-event CI stress SLO** — the fork has no such gate.
6. **Production-mode MCP bundle** — the fork's MCP runs the dev build.
7. **Board/lane descriptions riding with assume/get/create/move.**
8. **Sync publishes an unpushed state branch.**

## Rename-map notes from this port

- The map is one global case-preserving word swap plus the file
  renames in `apply-rename.sh`; 373 files touched, 15 paths renamed.
- **One latent test bug surfaced**: `git-safety.test.ts` compared a
  sorted received array against a hardcoded expected order that only
  sorted correctly under `epiq` (e < g). Fixed by sorting both sides;
  the rebuild's rename must re-check every order-sensitive assertion.
- `package.json` description carried a standalone `EPIQ` the map's
  `EPIQ_` env rule missed; the script now handles the bare word.
- Upstream tracks a `.epiq/project.json` **fixture** (a real project
  descriptor, dogfooding); it becomes `.ome/project.json` on the port
  branch and is tracked there. The fork's `.gitignore` lines
  (`.ome/project.json`, `docs/`, `.claude/worktrees/`) were applied to
  the port so local state cannot be committed.
- Attribution: `ljtn/epiq` URLs (in `install.sh`, `readme.md`,
  `version-check.ts`) and `LICENSE` untouched.

## Environmental note (agent sessions)

This box injects `core.hooksPath=/home/tcrypt/.local/share/agent-git-guard`
into every git subprocess via `GIT_CONFIG_*` env vars. The guard's
pre-push allows a push to `main` only when every pushed commit touches
nothing but `.ome/` and `.gitignore` (the OME board-init exemption).
Upstream 1.17.1's test fixtures push generic repos to `main` and hit the
guard: 133 unit failures in an agent session, 0 with the guard env
stripped. The rebuild's test fixtures should either keep the
board-init-shaped fixture (which passes the guard) or the CI image
should strip the guard env. Recorded so the next session does not chase
it.
