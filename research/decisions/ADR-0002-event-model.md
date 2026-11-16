# ADR-0002: Event model, identity, ordering, idempotency

Status: accepted (draft, pending Phase 3 evidence).
Date: 2026-11-16.

## Context

The current OME event model: one JSONL line per event, envelope
`{v, id:[eventId, refId]}`, `SCHEMA_VERSION = 1`, one legal root
(`init.workspace`), orphans anchored after, `effectiveEventTimes` for
poisoned timestamps, hand-rolled parse on the hot path pinned to a
zod schema. The rebuild adds many record types and must keep
deterministic replay, cross-machine merge, and migration from OME.

## Decision

1. **Durable id: ULID.** Causal order lives in the id. Short ref:
   last 7 chars, upper case. Migration from OME needs no renumbering.
2. **One legal root**: `init.workspace`. Any other event with a null
   parent is anchored as an orphan, never silently accepted as a root.
   This is OME's current rule and it holds.
3. **Causality and ordering**: parent links (`refId`) define the
   forest; ULID breaks ties. Wall-clock time is never the ordering
   source. `effectiveEventTimes` handles poisoned timestamps.
4. **Schema version**: integer, readable versions listed, with a
   compile-time assertion that the current version is in the list.
   Unknown newer types have a documented compatibility behavior:
   stored, surfaced as unknown, never dropped.
5. **Idempotency**: duplicate delivery collapses by event id at read
   time (existing OME behavior) and by `(kind, actorId, inputDigest,
   scope)` for ledger records (new). A retried write with the same
   request id returns the original result and writes nothing.
6. **Immutability**: events are immutable. Corrections are
   supersession events that link forward to the replacement. No
   in-place edit, ever, including for migrations.
7. **Conflict resolution**: union of event sets, never text merge.
   Conflicting decisions or constraints are both preserved and
   surfaced (a `contradicted` validity state for ledger records), never
   silently dropped.
8. **Resolution of short refs**: unique-or-error with prefix match
   (git-bug's rule). Ambiguity lists candidates; it never guesses.

## Rejected alternatives

- **Content-addressed ids (git-bug)**: breaks stable handles; a ticket
  edited 100 times would have 100 ids. The rebuild keeps one id per
  entity and versioning through events.
- **Wall-clock ordering**: rejected; poisoned clocks are real, and
  parent links plus ULID are sufficient.
- **Text merge of the log**: rejected; the forest merge is the
  invariant that makes cross-machine collaboration safe.
- **Mutable events**: rejected; supersession keeps history readable
  and makes contradictions explainable.

## Consequences

- Migration from OME is a copy of lines, deduped by event id, with
  the duplicate-write anomaly (`baseline/TEST_BASELINE.md`) cleaned
  during the hop.
- The ledger's reuse contract depends on `inputDigest` and `scope`
  being present; missing them makes a record `unverified`, never
  `valid`.
- The short-ref resolver needs an index on the projection; ambiguity
  becomes an O(1) lookup, not a board scan.
- Supersession chains must be traversable; the projection keeps a
  forward link index.
- The compile-time schema assertion must be kept; a new schema version
  that is not in the readable list fails the build.
