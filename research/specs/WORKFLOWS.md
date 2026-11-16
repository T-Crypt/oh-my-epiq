# Workflows

Status: draft for Phase 2 review. Implements OME_NEXT.md §5.3 and the
three primary workflows required by Phase 2.

## Workflow 1: solo developer, no agent

1. Create a work item with intent and acceptance criteria.
2. Record decisions and constraints as they arise.
3. Do the work. Record attempts as execution entries, each with a
   command, revision, and outcome.
4. Evidence attaches to criteria automatically when it names them.
5. Close: the system checks every criterion has fresh passing
   verification. If so, `done`. If not, it lists what is missing.
6. Later: the ledger shows which results are still valid. A change to
   a file marks dependent evidence stale, and the review view says so.

The human never needs a model. The board, CLI, and TUI cover this
workflow completely.

## Workflow 2: human plus one agent

1. Human writes the objective, the work item, the constraints, and the
   acceptance criteria. Constraints marked `user` origin.
2. Agent asks for ready work. Readiness is computed. The agent gets a
   short ref and a capsule.
3. Agent acquires the lease atomically. Fails if another actor holds it.
4. Agent works in its own workspace and branch. Each attempt writes
   `exec.*` records. Evidence links to criteria.
5. Agent requests review: status `in_review`, criteria verdicts listed.
6. Human reviews the diff and evidence, accepts or rejects.
   Acceptance writes a `human_accepts` verification. Rejection writes
   a `fail` and reopens.
7. Done requires fresh passing verification on every criterion.

The agent never sets `done` itself. It can ask for it.

## Workflow 3: several agents

Same as workflow 2, plus:

- Claims are atomic and fenced. Two agents requesting the same item:
  one wins, the other receives an already-claimed result naming the
  holder.
- Leases expire. An expired lease is reclaimable. A holder that
  outlives its lease is fenced: writes carrying an old token are
  rejected even if they arrive late.
- Handoffs are records, not messages. `handed_off_to` carries the
  capsule and the open questions. The receiver resumes from state.
- Blocked work releases automatically when the blocker clears. The
  dependency graph drives it; nobody negotiates by comment.
- Shared research items can have a `shared` lease policy, so several
  agents contribute observations without exclusive ownership.
- A later session resumes from the capsule, not from a transcript.

## Lease protocol

Acquisition (atomic, one writer per work item):

```
if workItem.leaseId points to a lease with state=active and expiresAt > now:
    reject: already claimed by <holder>
else:
    create lease L with fencingToken = max(existing tokens for item) + 1
    set workItem.leaseId = L, status = claimed
```

Properties:

- **Unique claim id**: each lease has a ULID.
- **Monotonic fencing token**: stored per work item; survives lease
  replacement.
- **Expiry and heartbeat**: `expiresAt` default short (configurable),
  heartbeat extends. A dead process stops heartbeating; the lease
  lapses on its own.
- **Recovery**: on boot, expired leases are marked `expired`. The work
  item returns to `ready` if it still meets readiness.
- **Explicit release**: the holder releases, keeping its records.
- **Completion**: release on done, with the final verification attached.
- **Stale owner prevention**: every write carries `leaseId` and
  `fencingToken`. A write whose token is lower than the current lease
  token is rejected with the current holder named. This is what stops
  a partitioned agent from continuing after losing the claim.
- **Idempotency**: each request carries a request id. A retried request
  with the same id returns the original result and writes nothing.
- **Conflict behavior**: two simultaneous claims, one succeeds. The
  loser gets a structured conflict (holder, token, expiry), not a
  silent overwrite.

## Handoff protocol

A handoff is an event with: from actor, to actor, work item, capsule
id, unresolved questions, and whether the sender's lease is released.

- Explicit handoff keeps the work item out of the ready pool until the
  receiver accepts.
- A blind reassignment (admin) is allowed and logged.
- The receiver gets the capsule plus the full ledger for the item.

## Autonomy boundary (what the product decides alone)

Decides alone: readiness, lease state, validity transitions, evidence
freshness, capsule assembly, stale marking, completion checks,
dependency releases.

Requires a human: promoting an inference to a constraint, accepting
work, setting `user` constraints, changing lease policy, deleting
history, migrating data.

Requires the actor: claiming, releasing, recording attempts, requesting
review, handing off.

## Failure and recovery table

| Failure | Behavior |
|---|---|
| Crash mid-write | Pending line flushes on next boot; duplicates collapse by id |
| Crash during lease | Lease lapses at expiry; work item returns to ready |
| Two writers, same item | One claim wins; the other gets a conflict |
| Late write from a dead holder | Rejected by fencing token |
| Lost remote, offline work | Local log grows; merge on reconnect; conflicts explained |
| Stale evidence after changes | Marked stale; blocks completion; names the cause |
| Migration interruption | Freeze gate; resume from the last completed step |

## Non-goals restated for these workflows

No embedded agent, no automatic PR creation, no model scoring of work
quality, no ticket-as-root. The agent is a client of the same state a
human uses.
