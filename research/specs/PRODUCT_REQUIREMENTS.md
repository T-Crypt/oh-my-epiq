# Product requirements

Status: draft for Phase 2 review. Owner: operator (Trev). Source:
OME_NEXT.md sections 4, 5, 8, 16, 18; the baseline and teardowns.

## What the product is

A local-first engineering work system. It keeps the intent, the
constraints, the dependencies, the verified observations, and the
attempts for engineering work, across people, agents, and time. A board
with tickets and a status field is one view of it, not the root.

The product does not run agents. It gives whichever agent the user
already runs the state it needs, and records what happened next.

## User problems (each traced to evidence)

| # | Problem | Evidence |
|---|---|---|
| P1 | An agent finishes a session and the next one starts cold: intent, constraints, and what was already tried live only in a transcript nobody reloads. | Vision §5.4, §5.5; beads teardown (memory plane exists because of this); our own 3-month OME logs |
| P2 | Work is marked done by a status field. Nothing links the claim to a test, diff, or review. | Vision §5.6; operator direction 2026-11-16 ("away from one ticket plus status") |
| P3 | A test result passes, then a source file changes, and nobody notices the verdict expired. Repeated work and false completion follow. | Vision §7.3 (StateWise); H4 in `OPPORTUNITY_ANALYSIS.md` |
| P4 | Readiness is guesswork: dependencies are prose, blockers are memory, and two agents take the same task. | Beads teardown (readiness is its headline); vision §5.3 |
| P5 | Agents get the whole board in context, or a hand-written brief. Neither is bounded or source-linked. | Vision §5.5; beads teardown (progressive disclosure) |
| P6 | Decisions and constraints drift out of date silently; a constraint written once is enforced never. | Vision §5.7; matrix dimension 7 (no competitor scores above 1) |
| P7 | Handoff between people and agents is a message, not a record: who had it, what they established, what is still open. | Vision §5.3; vk teardown (handoff bookkeeping) |

## Primary workflows

Full detail in `specs/WORKFLOWS.md`. Short form:

1. **Solo developer.** Create work, define acceptance criteria, record
   decisions, track attempts, close with evidence. No agent needed.
2. **Human plus one agent.** Human writes intent and constraints;
   agent claims ready work, runs in its own workspace, records
   attempts and evidence; human reviews the diff and accepts.
3. **Several agents.** Claims are atomic and fenced; readiness is
   computed, not negotiated; handoffs carry the ledger; a later
   session resumes from structured state.

## P0 scope (the spine)

From `OPPORTUNITY_ANALYSIS.md`:

- typed work graph and relationships;
- deterministic readiness;
- atomic claims and recoverable leases;
- execution ledger with validity states;
- evidence-linked acceptance and verification freshness;
- bounded context capsules;
- compact CLI and MCP, short refs, qualifier filters, progressive
  disclosure;
- migration from current OME state.

## P1 (after P0 validates)

Decision and constraint lineage; session continuity and explicit
handoff records; artifact/diff/test association; automatic stale
detection; task-to-code mapping; human review surfaces; suggested work
discovery (always requires review before creating or closing work).

## Non-goals (held, restated)

Embedded agent runtime; dependency graph as the root abstraction;
server database; vector store; GraphQL API door; hosted sync service;
notifications and scheduled triggers; analytics dashboards.

## Exit gate for Phase 2 (from vision §12)

- The product can be explained without naming a UI framework or
  storage engine.
- Every P0 feature solves one of P1–P7 above.
- No required entity or workflow exists only as an LLM prompt.
- A human can use the core without connecting an agent.

Self-check against the gate: the seven P0 items map to problems P1,
P2, P3, P4, P5, P6 and the handoff half of P7. The UI and storage
engines appear nowhere above. The ledger and capsule are
deterministic extractions, not prompts. Workflow 1 is agent-free.
