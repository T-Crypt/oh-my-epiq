# ADR-0003: Graph model and typed relationships

Status: accepted (draft, pending Phase 3 evidence).
Date: 2026-11-16.

## Context

The rebuild replaces the ticket-and-status model with a typed work
graph. Vision §5.2 lists the candidate edges and requires allowed
source/target types, cardinality, deletion behavior, and cycle rules.
No competitor scores above 1 on decision/constraint lineage, so the
graph is the main differentiator after the ledger.

## Decision

1. **Edges are records, not columns.** Each relationship has an
   author, a timestamp, and a reason. Drift is explainable because
   every edge can be traced to who made it and when.
2. **Typed edges only.** The allowed set from `CORE_DOMAIN_MODEL.md`:
   `depends_on`, `blocks`, `parent_of`, `implements`, `supersedes`,
   `constrained_by`, `satisfies`, `produced_by`, `observed_in`,
   `claimed_by`, `handed_off_to`, `reviewed_by`, `touches`. No
   generic edge type. Each type has one meaning.
3. **Cycle rules.** `depends_on`, `blocks`, `parent_of`, and
   `supersedes` forbid cycles. `blocks` is the inverse of
   `depends_on` and is written as such. Cycle detection runs at write
   time and rejects the edge, listing the cycle path.
4. **Cardinality.** One parent per work item (`parent_of`). Many
   dependencies. Many constraints per work item. One active lease per
   work item. Many evidence records per verification.
5. **Deletion behavior.** Edges are never deleted; they are
   superseded or revoked by a new edge with a reason. Revocation is
   itself an event. This keeps history readable.
6. **Readiness is computed from the graph**, not stored. It is
   recomputed on read; a cached projection carries a rebuild rule.
7. **Blocked state is orthogonal to status.** Any status can carry a
   blocker edge. The dependency graph, not a person, releases blocked
   work when the blocker clears.
8. **Work items require a spec or an explicit draft exemption.** A
   draft with no spec and no exemption is not ready.

## Rejected alternatives

- **Generic edge type with undocumented semantics**: rejected by the
  vision explicitly. A generic edge hides meaning and makes drift
  undetectable.
- **Storing readiness as a flag**: rejected; it would drift from the
  graph and silently lie. Computed on read, cached with a rebuild rule.
- **Deleting edges**: rejected; history must explain why a dependency
  existed and was removed.

## Consequences

- Cycle detection must be O(edges in the affected subgraph) and run
  synchronously on write. At 400k events this is a projection concern,
  measured in Phase 3.
- The projection needs an edge index keyed by (from, type) and (to,
  type) for readiness queries.
- Migration maps OME's implicit dependencies (comments saying
  "blocked by") to explicit edges only when a human or a reviewed
  suggestion creates them. No auto-edge from prose.
- Supersession chains must be traversable in both directions for
  decision lineage.
