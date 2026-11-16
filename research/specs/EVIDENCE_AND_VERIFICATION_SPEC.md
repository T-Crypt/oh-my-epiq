# Evidence and verification spec

Status: draft for Phase 3 spike. Implements OME_NEXT.md §5.6 and §7.3,
and the operator direction of 2026-11-16 (no more one ticket plus a
status).

## Purpose

Completion is supported by evidence, not asserted by a status field.
A work item is done when its acceptance criteria are satisfied by
fresh verification records that link to real artifacts.

## Evidence

An evidence record names what was produced and under which conditions:

```
id, kind, uriOrPath?, digest, command?, exitCode?,
environmentFingerprint?, producedByExecutionId?, createdAt, retention
```

Kinds: `test_run`, `lint`, `typecheck`, `build`, `diff`, `commit`,
`report`, `screenshot`, `benchmark`, `review`, `human_acceptance`.

Rules:
- Evidence without inputs (command, revision, environment) is weak.
  It can be attached but cannot satisfy a criterion alone.
- Secrets are never stored in evidence. Commands are sanitized before
  recording; outputs are digested, and raw output is kept only when
  the retention policy allows.
- Evidence belongs to the actor who produced it, with the session and
  workspace recorded.

## Verification

One verification row per criterion check:

```
id, criterionId, evidenceIds[], verifier, outcome, freshness, checkedAt, reason?
```

- `outcome`: `pass`, `fail`, `skipped`, `unknown`.
- `verifier`: a named tool (`vitest`, `tsc`, `eslint`, `build`) or a
  person (`reviewed_by`). An agent's own claim is not a verifier.
- A criterion is **satisfied** only by a verification with
  `outcome == pass` and `freshness == fresh`.

## Freshness

Freshness is computed, not declared:

- `fresh`: every input the check depended on still hashes the same as
  at `checkedAt`.
- `stale`: an input changed after `checkedAt`. The record names what
  changed.
- `unknown`: inputs cannot be checked now.

Invalidation triggers, cheapest first:

1. Any file in the check's scope changed.
2. Dependency or lockfile state changed.
3. Environment or tool version changed.
4. The branch advanced past the checked revision.
5. Retention expired.

A passing test recorded before a relevant source change does not count
as verification after the change. This is the core rule.

## Completion rules

- `done` requires every acceptance criterion satisfied.
- If any criterion has no fresh passing verification, the work item is
  not done, whatever its status text says.
- A human acceptance (`human_accepts`) is recorded like any other
  verification, with the reviewer named and a timestamp. It does not
  require an artifact, but it requires an identity.
- Regression: a change elsewhere can invalidate a criterion through
  the dependency graph. Scope is computed from the graph, not guessed.

## Status semantics (kept small)

Five user-facing states: `draft`, `ready`, `claimed`/`in_progress`
(the work), `in_review`, `done`, plus orthogonal `blocked`. The
verification state is separate from status, so "in review" can mean
"evidence exists, human pending" and "done" always means criteria met.

## Review surface (P1, shape fixed now)

The review view shows, per criterion: statement, verdict, evidence
link, checked at, freshness, and the diff that the evidence covers.
A reviewer accepts or rejects with an identity. Rejection writes a new
verification (`fail`) and reopens the work item. No second agent
product is needed.

## Migration

Current OME tickets become work items with their description split
into spec plus acceptance criteria when the text contains explicit
criteria. Existing comments and attachments become evidence or notes
with validity `unverified`. Nothing is marked done during migration;
completion must be re-earned under the new rule, and the log records
that.
