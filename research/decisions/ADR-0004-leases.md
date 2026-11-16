# ADR-0004: Atomic claims, leases, and fencing

Status: accepted (draft, pending Phase 3 evidence).
Date: 2026-11-16.

## Context

Two agents can take the same task if a claim is a status update.
Beads uses compare-and-swap with no TTL; Vibe Kanban has no lease
concept at all. The rebuild needs atomic acquisition, expiry,
heartbeat, recovery, and stale-owner prevention. The operator's
direction is explicit: "claimed work that stalls must be visible and
reclaimable".

## Decision

1. **Claim is an atomic transition, not a status edit.** `assignee ∈
   {'', expired holder} → me`, `status → claimed`, and a new lease
   record, in one log append.
2. **Lease shape**: holder actor, ULID, monotonic fencing token,
   acquiredAt, expiresAt, lastHeartbeatAt, state.
3. **Fencing token**: monotonic per work item, survives lease
   replacement. Every write carries leaseId and fencingToken. A write
   whose token is lower than the current lease token is rejected with
   the current holder named. This is what stops a partitioned agent
   from continuing after losing the claim.
4. **Expiry and heartbeat**: default short TTL, configurable;
   heartbeat extends. A dead process stops heartbeating; the lease
   lapses on its own.
5. **Recovery**: on boot, expired leases are marked `expired` and the
   work item returns to `ready` if it still meets readiness.
6. **Idempotency**: each request carries a request id. A retried
   request returns the original result and writes nothing.
7. **Conflict behavior**: two simultaneous claims, one succeeds. The
   loser gets a structured conflict naming holder, token, and expiry.
   Never a silent overwrite.
8. **Shared claims**: a work item can have a `shared` lease policy
   for research and review, allowing multiple observations without
   exclusive ownership. Implementation leases stay exclusive.
9. **Explicit release**: the holder releases, keeping its records.
   Completion releases on done, with final verification attached.
10. **Handoff**: an explicit event carrying from-actor, to-actor,
    work item, capsule id, and unresolved questions. Keeps the item
    out of the ready pool until accepted.

## Composition with beads' CAS

Beads' claim semantics (assignee ∈ {'', pool-alias} → me) are the
base. The rebuild adds the expiry and the fencing token on top. Both
are needed: CAS prevents the race, expiry makes stalled work
reclaimable, and the fencing token prevents late writes after
reclaim. Neither alone is sufficient.

## Rejected alternatives

- **CAS only, no TTL (beads)**: rejected because stalled work stays
  claimed forever; the operator's requirement is explicit.
- **TTL only, no fencing (naive)**: rejected because a partitioned
  agent can continue writing after losing the claim. Fencing is the
  fix.
- **Time-based lease with no monotonic token**: rejected; clock skew
  makes expiry comparisons unreliable across machines.
- **Embedded agent runtime (vibe-kanban)**: rejected; the product
  records work, it does not run agents.

## Consequences

- The projection needs a (workItemId, fencingToken) index and a
  heartbeat update path.
- Lease expiry is evaluated on read and on a background sweep; both
  must agree.
- Migration: OME has no leases. Existing assigned tickets become work
  items with `leaseId = null` and `status = ready` or `in_progress`
  depending on the old status. No synthetic leases are minted.
- The claim race is the headline test: two simultaneous claims, one
  wins, the other gets a conflict, and no record is duplicated.
