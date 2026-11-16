# Teardown — Vibe Kanban (BloopAI/vibe-kanban)

Recorded 2026-11-15, Phase 1, from `~/ome-research/sources/vibe-kanban`
(depth-50 clone of main). Rust server (sqlx + SQLite, Tauri desktop,
web + mobile frontends), v0.1.46, ~28.7k stars. Positioning: "plan
with kanban issues, run coding agents in workspaces, review diffs and
send feedback to the agent without leaving the UI".

## 1. What it is, structurally

A **server-centric execution product**, not a peer protocol:

- One server process owns a SQLite database (sqlx, migrations,
  preupdate hook for change notifications).
- Clients: web (local + remote), Tauri desktop, mobile.
- Remote access over its own relay stack (webrtc/ws tunnels,
  trusted-key auth).
- The board is a convenience view; the product's center of gravity is
  **the agent execution loop**.

## 2. Task graph

- `tasks` table is flat: `id (UUID), project_id, title,
  description, status, parent_workspace_id, created/updated`.
  No tags on the task row itself (tags live in a separate `issue_tags`
  surface), no assignee row, no dependency graph, no event log, no
  CRDT.
- `workspaces` is the execution unit: a workspace gets **a git
  worktree, a branch, a terminal, and a dev server**. A migration
  (2026-02-17) **removed the task FK from workspaces** — tasks and
  workspaces were deliberately decoupled: one task can have many
  attempts, one workspace can run without a task.
- `task_attempts` + `task_attempt_activities`: every execution is an
  attempt with a stream of activities. `coding_agent_turns` carries a
  `seen` flag (has the human looked at this turn).
- `tracked_prs`, `repos` (working dir, target branch, archive
  script), `executor_sessions`.
- The schema is a **living flat relational model**: 40+ migrations
  including "add missing indexes for slow queries" and "optimize
  query planner" — evidence of real query load, and of a team that
  fixes performance by adding indexes rather than changing the model.

**Read:** this is the anti-CRDT pole: single writer, single source,
plain SQL. It is the correct shape for a product that runs agents
(but it cannot be the shape of the rebuild's shared board, which must
merge across machines with no server). The rebuild borrows its
**attempt/turn bookkeeping**, not its storage.

## 3. Agent execution (the part worth stealing)

- **One executor adapter per agent**, under
  `crates/executors/src/executors/`: `acp`, `amp`, `claude`, `codex`,
  `copilot`, `cursor`, `droid`, `gemini`, `opencode`, `qwen` (+ a
  `qa_mock`). Each is a long-running child process; ACP (Agent
  Client Protocol) is a first-class adapter, so conforming agents
  plug in without a bespoke module.
- The server talks to the agent **over stdio**: JSON protocol lines
  for ACP/Claude, combined prompts written to stdin for the rest
  (`amp.rs:77`, `claude/protocol.rs:192`).
- `approvals.rs`: gated operations (the human approves before the
  agent proceeds) — a route-level approval surface, not just a model
  capability.
- `sessions/` routes: sessions track a running agent with its turns;
  interaction-during-execution is a documented core feature
  (docs/core-features/monitoring-task-execution.mdx).

**Read:** the rebuild's "harness lanes" concept and hadal's lane both
live in this space, but the rebuild does **not** embed agents (that is
hadal's job, not the product's — DESIGN.md §6). What the rebuild
steals is the **bookkeeping**: attempt, turn, seen-flag, approval. An
Insight/Outcome record in the rebuild gets the same shape: named
attempts, visible turns, human-seen state, gated approvals.

## 4. Diff review → the agent (the loop that made the stars)

- `crates/server/src/routes/sessions/review.rs` builds
  `build_review_prompt(context, additional_prompt)` from the inline
  diff comments and writes it to the agent's stdin. The human's
  review **is** the next prompt.
- `crates/review/`: GitHub-side review integration (PRs, archives,
  session selection).
- The loop, end to end: plan as issues → start a workspace (worktree +
  branch + dev server) → agent executes, dev server previews the app
  (built-in browser with devtools, inspect mode, device emulation) →
  human reviews the diff with inline comments → comments become the
  agent's next prompt → repeat → PR with AI-generated description →
  merge.

**Read:** "review becomes the next prompt" is the single most
transferable idea. The rebuild's board is where plans live, not where
agents run, but the **shape** belongs on the rebuild's records: an
Outcome's acceptance and a Rehearsal's verdict are review-shaped
(inline, per-hunk, human-authored, fed back to the next attempt). The
rebuild stores that feedback as board events a harness can read; it
never pipes it itself.

## 5. Why it has 28.7k stars

Not the data model. The execution loop and the breadth: one-command
start (`npx vibe-kanban`), ten agent adapters (including the open ACP
protocol), app preview with devtools, PR flow, team/org model,
self-hosting, desktop + web + mobile, a relay for remote access. It
solves "I have an agent and I want to supervise it well", which is
the operator's actual daily problem. The OME rebuild answers a
different question ("where do the plans, the evidence, and the
learnings live across machines") and should not try to be this
product.

## What the rebuild takes from Vibe Kanban

1. **Attempt/turn/seen bookkeeping** on Outcome and Rehearsal records
   (named attempts, human-seen flags, per-turn history).
2. **Review-shaped feedback**: inline, per-item, human-authored, and
   the input to the next attempt. Stored as events, not piped.
3. **Approvals as a first-class state**, not a side channel.
4. **ACP as the interop protocol** for any harness integration the
   rebuild exposes (hadal speaks ACP; the rebuild's API is
   ACP-adjacent in shape).
5. **Performance practice**: flat model + indexes + preupdate hooks
   beat clever storage at this scale.

## What the rebuild does NOT take

- The embedded execution (no worktrees, terminals, or dev servers in
  the rebuild; that is hadal's lane).
- Single-writer SQLite as the source of truth (the rebuild is
  CRDT-first; SQLite is projection only).
- The org/team server model (the rebuild's sharing is git remotes and
  the state branch, not a server's user table).
