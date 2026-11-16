# Opportunity analysis

Recorded 2026-11-16, Phase 2. Tests the vision doc's hypotheses H1–H5
against `COMPETITOR_MATRIX.md` and the teardowns. Rank by user value,
competitor coverage (low = open), cost, complexity, measurable
advantage.

## Ranking

| Rank | Hypothesis | User value | Competitor coverage | Cost | Complexity | Verdict |
|---|---|---|---|---|---|---|
| 1 | H1 verified execution state | High | Low (best: beads 3, vk 4) | Med | High | **P0, centerpiece** |
| 2 | H4 evidence freshness | High | Low (vk 4 only) | Med | Med | **P0** |
| 3 | H2 context capsules | High | Low (beads 4; others 1–2) | Med | Med | **P0** |
| 4 | H3 agent-neutral coordination | High | Medium (beads 5, vk 4) | Med | Med | **P0 shape** |
| 5 | H5 low-overhead intelligence | Medium | Low–medium | Low | Low | P1, after validation |

## H1 — verified execution state (adopt as the differentiator)

Evidence: no competitor records *observations with validity*. Beads
records task state and memories; Vibe Kanban records attempts/turns;
git-bug records entity versions. None answers "is that test result
still true after this commit?" The vision doc §5.4 is the design:
actor/session, action, command+args, repo/worktree/SHA, fingerprints,
validity states (`valid`, `stale`, `superseded`, `contradicted`,
`unknown`, `unverified`), and reuse-only-when-inputs-hold.

Measurable advantage: stale-fact rate and repeated-execution count in
the continuation corpus (Phase 3 spike). Gate: a prior test result
whose relevant files changed must be marked stale, not reused.

## H2 — context capsules (adopt, bounded)

Beads' memory plane is the nearest rival, but it stores facts, not a
task-shaped packet. The capsule spec (§5.5): token budget from the
caller, deterministic ordering, source references, compact default +
full detail, no LLM call for baseline assembly, constraints never
dropped, omitted material exposed. Measured on the continuation
corpus: task success, constraint retention, tokens, latency.

Gate: capsule assembly must be deterministic and LLM-free; quality is
measured against a full-history baseline, not against nothing.

## H3 — agent-neutral coordination (adopt the shape, not the runtime)

Vibe Kanban bundles the agent; Beads wraps one harness per setup.
The rebuild stays a work-state layer: no embedded executor, but first
class records for session, workspace, attempt, handoff. Adopt ACP as
the interop protocol for any harness bridge (hadal speaks ACP).

Gate: an agent with no special product can claim ready work, record
attempts and hand off using only the CLI/MCP; the product itself never
spawns a model.

## H4 — evidence freshness (adopt, couples to H1)

Completion without evidence is the status-field problem the operator
named. Evidence links to an acceptance criterion; freshness is
invalidated by changes to its inputs (files, env, deps, tool version).
This is the mechanism that makes H1 usable at completion time.

Gate: a passing test recorded before a relevant change is not counted
as verification after it.

## H5 — low-overhead intelligence (defer)

Typed records + indexes + qualifier queries already give most of the
value (git-bug's DQL proves the shape). Vector retrieval stays
optional and is not in P0. Reconsider if P0 ships and users ask.

## What this means for P0

P0 is the spine, in this order:

1. Work graph + typed relationships (depends_on, blocks, parent_of,
   implements, supersedes).
2. Deterministic readiness (dependencies satisfied, not blocked,
   context available, lease policy permits).
3. Atomic claims + fencing tokens + expiry/heartbeat/recovery.
4. Execution ledger (H1) with validity states and invalidation rules.
5. Evidence-linked acceptance criteria + verification freshness (H4).
6. Bounded context capsules (H2).
7. Compact CLI/MCP with short refs, qualifier filters, progressive
   disclosure.

Non-goals held: embedded agents, dependency-first board, server
model, vector store, GraphQL door.

## Explicitly rejected opportunities (recorded so they are not
re-litigated)

- A generic edge type with undocumented semantics (vision §5.2).
- Reusing an observation silently when inputs changed.
- Letting generated summaries erase human-authored constraints.
- A fourth API door (GraphQL).
- One-tool-per-filter-combination instead of qualifiers.
