# Execution ledger spec

Status: draft for Phase 3 spike. Implements OME_NEXT.md §5.4 and §7.1,
§7.3. This is the product's centerpiece and its main differentiator
(`OPPORTUNITY_ANALYSIS.md` H1).

## Purpose

Answer three questions without an LLM and without re-running anything:

1. What is now known about the repository?
2. Which earlier results can be safely reused?
3. Which must be refreshed, and why?

A transcript says what was discussed. A tool log says what a process
printed. The ledger says what was observed, under which inputs, and
whether that observation still holds.

## Records

The ledger is not a second store. It is a set of event actions in the
same append-only log as every other fact, plus a projection indexed
for lookup. Action names:

| Action | Meaning |
|---|---|
| `exec.observed` | Read a file, symbol, or state at a revision |
| `exec.ran` | Ran a command in a workspace |
| `exec.changed` | Produced a diff or commit |
| `exec.attempted` | Tried an operation, succeeded or failed |
| `exec.discovered` | Found a dependency, blocker, constraint, behavior |
| `exec.verified` | Checked an acceptance criterion against evidence |

Each action carries this envelope (fields optional per action):

```
id              ULID
kind            one of the six above
actorId         who did it
sessionId?      bounded session
workspaceId?    isolated working directory
repository      path or remote name
branch?         branch at the time
baseSha?        commit SHA the observation is relative to
startedAt, endedAt
exitCode?       for ran/attempted
command?        tool or argv, sanitized
args?           sanitized argument summary
envFingerprint  hash of environment and tool versions that matter
inputDigest     hash of inputs (file contents, config, deps)
outputDigest    hash of outputs
files[]         paths observed or changed
symbols[]       symbols observed or changed
scope?          what claim this record speaks to
workItemId?     associated work
criterionId?    associated acceptance criterion
provenance      observed | derived | inferred
confidence     0..1, required when provenance != observed
```

Invariants:
- `provenance: observed` requires a real command or read behind it.
- `derived` records name their inputs by id.
- `inferred` records are suggestions and never feed readiness,
  verification, or completion without human promotion.
- Duplicate delivery and retry collapse by `(kind, actorId,
  inputDigest, scope)`; the projection keeps one row per key.

## Validity states (formal)

| State | Definition | May be reused? |
|---|---|---|
| `valid` | Every input the record depends on still hashes the same, the environment fingerprint matches, the tool version matches, and no later record contradicts it. | Yes, within scope |
| `stale` | An input changed after `endedAt`: a file in scope, the environment, dependency state, tool version, or the branch moved past `baseSha`. | No. Refresh or reject |
| `superseded` | A later record answers the same question with newer inputs and equal or better provenance. | No, use the successor |
| `contradicted` | Another record asserts the opposite with equal or better provenance and still-valid inputs. | No. Surface both |
| `unknown` | Inputs cannot be checked now: repository absent, artifact gone, machine unreachable. | No. State why |
| `unverified` | Recorded but never checked for validity. | No, until checked |

Transitions are one-way in practice: `unverified -> valid|unknown`,
`valid -> stale|superseded|contradicted|unknown`. A record can be
re-validated back to `valid` by a fresh check; it never silently
returns.

## Invalidation rules (deterministic)

Checked in this order, cheapest first:

1. **File scope.** For each path in `files[]`, hash the file now. Any
   difference from the recorded hash makes the record `stale`, with
   the changed paths listed.
2. **Environment.** Compare `envFingerprint`. A difference makes it
   `stale`, naming the changed component (interpreter, tool version,
   dependency lock).
3. **Revision.** For repo-scoped records, if the branch has advanced
   past `baseSha`, mark `stale` (or `superseded` if a newer record
   exists at the new SHA).
4. **Contradiction.** If another record of the same `kind` and `scope`
   has newer inputs and a conflicting result, mark `contradicted` and
   link both.
5. **Supersession.** A newer record with the same `scope` and a
   superset of inputs marks the older `superseded`.
6. **Retention.** Past retention, mark `unknown`, never delete silently.

All checks are pure functions of the log plus current hashes. No
network, no model call, no clock except `now` for retention and
lease handling.

## Reuse contract

A consumer may reuse a ledger record only when:

- the record's `validity == valid`;
- the consumer's question falls inside the record's `scope`;
- the consumer's inputs match the record's `inputDigest` for the parts
  the record depends on.

If any condition fails, the ledger reports the best available record,
its state, and the reason, and the caller decides whether to refresh.
The product never silently substitutes a stale result for a fresh one.

Safe first version: advise only. Any future guard that intercepts or
blocks a command must be opt-in, visible in the UI, and fail closed for
destructive operations.

## Projection and indexes

The projection is rebuildable from the log. Required indexes:

- `(workItemId, kind, validity)`
- `(repository, branch, baseSha)`
- `(inputDigest)`
- `(scope, endedAt)`

SLO from upstream CI (`port/PORT_NOTES.md`): at 400k events, a
ledger lookup for one work item returns in under 2 seconds. Phase 3
spikes this before the storage ADR.

## Migration from OME today

OME has comments, notes, commit links, and attachments. Mapping:

| OME today | Ledger |
|---|---|
| comment on a ticket | `exec.attempted` or review note, actor-tagged |
| note | `exec.discovered` if factual, else prose attachment |
| commit link | `exec.changed` with `baseSha` and `outputDigest` |
| attachment | Artifact record, linked to its producing execution |

Existing data gains validity `unverified`. Nothing is discarded; the
old views still render.

## Anti-patterns (recorded so they are not reintroduced)

- Storing a boolean `passed` with no inputs. A test result without
  command, SHA, and file hashes is not evidence.
- Reusing a result because it is recent. Recency is not validity.
- Letting a generated summary overwrite a recorded observation.
- Marking something `done` because an agent said so. Completion reads
  verification records, not status text.
