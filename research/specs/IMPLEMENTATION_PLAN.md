# Implementation plan

Status: draft for Phase 3 review. Implements OME_NEXT.md §12 phases
2–4 and the P0 spine from `OPPORTUNITY_ANALYSIS.md`.

## Sequence

1. Phase 3: build the throwaway prototypes listed below and the
   storage/readiness/lease/capsule/validity benchmarks. Write the ADRs.
2. Only when the gates pass: create a new repository (`cairn` or the
   locked name) and an isolated rebuild branch.
3. Implement the P0 vertical slice in this order:
   a. Event model and projection (log unchanged, SQLite added).
   b. Work graph + typed edges + readiness.
   c. Leases + fencing + recovery.
   d. Execution ledger + validity.
   e. Evidence + verification + completion gate.
   f. Context capsule.
   g. Compact CLI/MCP with short refs and qualifier filters.
   h. Migration from OME state.
4. Phase 5: agent integration, workflows, handoff.
5. Phase 6: human interface redesign.
6. Phase 7: migration, compatibility, resilience.
7. Phase 8: release preparation and new repository.

## P0 vertical slice (smallest useful thing)

One work item, one objective, one acceptance criterion, one passing
test as evidence, one capsule, one claim. End to end:

- create objective and work item;
- define a criterion (`test_passes`);
- run a command, record `exec.ran` + `exec.verified`;
- mark the criterion satisfied;
- claim and release the lease;
- assemble a capsule that contains the criterion, the evidence, and
  the constraint;
- resume from the capsule in a second session and confirm the verdict
  is fresh.

If this slice does not work, nothing else ships.

## Phase 3 prototypes (under research/prototypes/)

- `graph-model/` — typed edges, cycle detection, readiness.
- `lease-manager/` — CAS acquisition, fencing, expiry, recovery.
- `execution-ledger/` — records, validity, invalidation, reuse.
- `context-capsules/` — budgeted assembly, omission manifest.
- `evidence-freshness/` — file-hash invalidation, dependency scope.
- `storage-comparison/` — log replay vs SQLite vs Dolt on the 400k bar.

Each prototype is throwaway. None of them becomes the product directly.

## Gates before code in the new repo

- Storage ADR accepted, with benchmark evidence at the 400k bar.
- Readiness, lease, and validity specs reviewed by the operator.
- Capsule corpus design written, even if not yet run.
- Migration fidelity limits written down.
- Name locked.

## What is not in this plan

Embedded agent runtime, server database, vector store, GraphQL, hosted
sync, notifications, analytics. All non-goals for P0.
