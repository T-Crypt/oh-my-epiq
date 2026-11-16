# Context capsule spec

Status: draft for Phase 3 spike. Implements OME_NEXT.md §5.5 and the
compaction findings in §7.2. Couples to `EXECUTION_LEDGER_SPEC.md`:
the capsule is assembled only from structured state and valid ledger
records.

## Purpose

Give a person or an agent exactly the context needed for the next
useful action, no more. Bounded by tokens, linked to sources, and
assembled without an LLM call for the baseline packet.

## Assembly inputs (all structured)

1. Work item: intent, spec, priority, lane, refs.
2. Objective it implements.
3. Acceptance criteria, unchanged and immutable.
4. Constraints scoped to the work item, by criticality.
5. Dependency and blocker summaries from the graph.
6. Decisions that touch the scope, with status.
7. Valid observations and evidence, newest first, with freshness.
8. Prior executions and attempts, and what each established.
9. Unresolved questions and risks from open discoveries.
10. Suggested next action and its verification command. Marked as
    inference.

## Packet structure (stable order)

The order is fixed so prompt caches and human review can rely on it:

```
1. Header            work ref, title, status, objective ref
2. Intent            spec, success measure
3. Constraints       blocking first, then advisory, each with origin
4. Criteria          acceptance criteria, each with current verdict
5. Dependencies      blocked-by and blocks, with target refs
6. Decisions         accepted and superseded, one line each
7. Evidence          valid records only, newest first, with digest
8. Attempts          prior executions, outcome, what they established
9. Open              unresolved questions and risks
10. Next             suggested action, verification command (inference)
```

Rules:
- Sections 1 to 6 are **stable**: they change only when their source
  entities change. This is the cacheable prefix.
- Sections 7 to 10 vary with execution. They follow the stable part.
- Every line carries a source reference: entity `ref` or ledger record
  id. No free-floating facts.
- Facts and inference are visually and structurally distinct. The
  suggested action is always labelled.

## Token budget

- The caller supplies a budget in tokens or bytes.
- Assembly fills sections in order and stops at the budget, then emits
  a manifest of what was omitted.
- Order of omission (last dropped first): attempts beyond the most
  recent two, evidence detail below digests, decisions superseded long
  ago, non-blocking discoveries, dependency chains beyond depth 1.
- Never omitted: header, intent, blocking constraints, acceptance
  criteria, active blockers. If the budget cannot hold them, the
  capsule reports the minimum size instead of truncating silently.
- Full detail is retrievable per section by ref, not by re-running the
  whole capsule.

## Constraint preservation

A `user`-origin or `security_policy` constraint is copied verbatim,
even when old, even when other context is compacted. Compaction may
compress surrounding prose but never the constraint text. This is a
hard rule from the vision's compaction findings: generated summaries
must not erase human-authored requirements.

## Determinism

Same work item, same log state, same budget, same packet bytes. No
model call in the baseline assembly. Timestamps are limited to the
packet header. Ordering within sections is explicit (by validity, then
by endedAt, then by id).

## Quality measurement (Phase 3 corpus)

Continuation corpus: an agent starts a task, hits a context boundary,
and continues from the capsule alone. Measure:

- task success against a full-history baseline;
- constraint retention (did it violate a constraint it was not told
  about?);
- token count and assembly latency;
- stale-fact rate (how often did it act on a `stale` record?).

Gate: a shorter capsule is not better if it drops a blocking
constraint. Constraint retention outranks token savings.

## Failure behavior

- Missing repository: capsule notes which evidence could not be
  validity-checked; those records show `unknown`.
- Budget invalid: report the minimum viable size.
- Assembly error: fail loudly with the section named. Never emit a
  partial packet without the header and the criteria section.
