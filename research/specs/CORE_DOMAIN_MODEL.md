# Core domain model

Status: draft for Phase 2 review. Implements OME_NEXT.md §5.1–§5.3,
sharpened by `COMPETITOR_MATRIX.md` and the teardowns.

## Root abstraction

The root is **connected engineering state**, not a board. A board is a
saved qualifier over work items, plus a grouping. Every entity is
addressable, typed, and carries its own lifecycle. Nothing exists only
as free text inside another record.

## Entities

### Objective

Durable outcome or project-level intent. Several work items implement
one objective.

Fields: `id`, `title`, `description`, `owner`, `successMeasure`,
`status` (`proposed`, `active`, `achieved`, `abandoned`),
`createdAt`, `updatedAt`. Invariant: an achieved objective links to
verification records, not to a status alone.

### WorkItem

A bounded unit of engineering work. This is the thing agents claim.

Fields: `id`, `ref` (7-char short form), `objectiveId?`, `title`,
`spec`, `priority`, `status` (`draft`, `ready`, `claimed`, `in_progress`,
`in_review`, `done`, `cancelled`), `estimate?`, `lane?`, `tags[]`,
`assignee?`, `leaseId?`, `acceptanceCriteria[]`, `blockedBy[]`,
`parentId?`, `createdAt`, `updatedAt`.

Invariants:
- `status` is derived where possible: `ready` comes from the readiness
  rule below, not from a person typing it.
- A work item cannot be `in_progress` without a live lease.
- Completion requires at least one satisfied acceptance criterion
  whose verification is fresh (see `EVIDENCE_AND_VERIFICATION_SPEC.md`).

### AcceptanceCriterion

Fields: `id`, `workItemId`, `statement`, `kind`
(`test_passes`, `lint_clean`, `typecheck_clean`, `build_succeeds`,
`human_accepts`, `benchmark_within`), `verificationIds[]`.

### Decision

Fields: `id`, `title`, `rationale`, `alternatives[]`, `author`,
`origin`, `status` (`proposed`, `accepted`, `superseded`, `expired`),
`supersedesId?`, `revisitAt?`.

Invariant: a superseded decision stays readable and linked forward.

### Constraint

A rule or requirement that work must preserve.

Fields: `id`, `statement`, `origin` (`user`, `product_policy`,
`security_policy`, `architecture`, `external`), `scope` (entity ids or
patterns), `criticality` (`blocking`, `advisory`), `validationMethod?`,
`expiresAt?`.

Invariant: agents may propose constraints, never promote one to
`user` origin. Promotion is a human action.

### Discovery

A finding that creates or changes work.

Fields: `id`, `statement`, `source`, `confidence`, `relatedFiles[]`,
`suggestedFollowUp?`, `createdWorkItemId?`.

### Observation

A statement about repository or runtime state, with validity.

Fields: `id`, `statement`, `source`, `inputDigest`, `observedAt`,
`validity` (`valid`, `stale`, `superseded`, `contradicted`, `unknown`,
`unverified`), `invalidatedBy?`, `scope` (files/symbols/commands).

See `EXECUTION_LEDGER_SPEC.md`; observations are the ledger's read
shape.

### Execution

A bounded attempt by an actor in a workspace.

Fields: `id`, `workItemId`, `actorId`, `sessionId?`, `workspaceId?`,
`branch?`, `baseSha?`, `startedAt`, `endedAt?`, `outcome`
(`running`, `succeeded`, `failed`, `abandoned`, `blocked`), `summary?`.

### Evidence

A verifiable artifact supporting a claim.

Fields: `id`, `kind` (`test_run`, `lint`, `typecheck`, `build`, `diff`,
`commit`, `report`, `screenshot`, `benchmark`, `review`), `uriOrPath?`,
`digest`, `command?`, `exitCode?`, `environmentFingerprint?`,
`producedByExecutionId?`, `retention`.

### Verification

A result for one acceptance criterion.

Fields: `id`, `criterionId`, `evidenceId?`, `verifier` (tool or
person), `outcome` (`pass`, `fail`, `skipped`, `unknown`), `freshness`
(`fresh`, `stale`, `unknown`), `checkedAt`, `reason?`.

### Artifact

A durable output such as a diff, report, log, or file.

Fields: `id`, `kind`, `location`, `digest`, `sizeBytes`, `retention`.

### AgentIdentity

Fields: `id`, `provider`, `label` (model or agent name), `machine`,
`capabilities[]`. Format: `provider/label@machine` as the display
form. One actor per event.

### Session

One bounded interaction or execution period.

Fields: `id`, `workItemId?`, `actorId`, `runtime`, `contextCapsuleId?`,
`startedAt`, `endedAt?`, `exitReason?`.

### Workspace

An isolated working directory or worktree.

Fields: `id`, `repository`, `branch`, `baseSha`, `status`
(`preparing`, `ready`, `dirty`, `archived`, `removed`), `cleanupState`.

### Lease

Exclusive or time-limited ownership of a work item.

Fields: `id`, `workItemId`, `holderActorId`, `fencingToken`
(monotonic), `acquiredAt`, `expiresAt`, `lastHeartbeatAt`,
`releasedAt?`, `state` (`active`, `expired`, `released`).

See `WORKFLOWS.md` for acquisition and recovery.

### Organizing entities (light)

- **Project**: one repository's board. Replaces OME's project record;
  holds the git remote set and the default branch.
- **Lane**: a named grouping value on a work item (`lane` field), not
  a container with its own storage.
- **Tag**: a label with a colour, attached to work items.
- **Contributor**: a person or agent identity registered on the board.
- **Board**: a saved qualifier plus grouping (`lane`, `tag`,
  `objective`). Computed, never stored as a list of items.

## Relationships (typed, with endpoints)

Allowed edges, each with cardinality and cycle rules:

| Edge | From | To | Cardinality | Cycles |
|---|---|---|---|---|
| `depends_on` | WorkItem | WorkItem | many-many | forbidden |
| `blocks` | WorkItem | WorkItem | many-many | inverse of depends_on |
| `parent_of` | WorkItem | WorkItem | one parent, many children | forbidden |
| `implements` | WorkItem | Objective | many-one | n/a |
| `supersedes` | Decision | Decision | one-one chain | forbidden |
| `constrained_by` | WorkItem | Constraint | many-many | n/a |
| `satisfies` | Verification | Criterion | many-one | n/a |
| `produced_by` | Evidence | Execution | many-one | n/a |
| `observed_in` | Observation | WorkItem | many-one | n/a |
| `claimed_by` | WorkItem | Lease | one active | n/a |
| `handed_off_to` | WorkItem | AgentIdentity | history | n/a |
| `reviewed_by` | WorkItem | Contributor | history | n/a |
| `touches` | Execution | file/symbol | history | n/a |

Rules: every edge is a record with an author and a timestamp, so drift
is explainable. Dependency cycles are detected when the edge is
written and rejected with the cycle listed. Generic edges are not
allowed; each type above has one meaning.

## Readiness (deterministic)

A work item is ready when all hold:

1. `status == draft` is not enough: it must have a spec, or an
   explicit `draft` exemption.
2. Every `depends_on` target is `done` (or the edge is explicitly
   waived with an author and reason).
3. No open blocker edge points at it.
4. Required context exists: referenced files, decisions, and
   constraints resolve; missing references are reported, not guessed.
5. Access exists: required repositories are connected and fetchable.
6. Its lease policy permits a claim: no active lease, or the lease is
   expired and reclaimable, or the policy allows shared claims.
7. No contradictory verification: a failing fresh verification blocks
   readiness until resolved.

Readiness is recomputed from current state on read. It is never a
stored flag except as a cached projection with a rebuild rule.

## Status lifecycle

```
draft -> ready -> claimed -> in_progress -> in_review -> done
any state -> blocked (while a blocker edge is open)
any state -> cancelled (terminal, keeps history)
```

- `ready` is computed. `claimed` is set by the lease.
- `in_progress` requires a live lease and a session.
- `in_review` means evidence exists and awaits a human or a named
  verifier.
- `done` requires every criterion satisfied by fresh verification.
- `blocked` is orthogonal: any state can carry it while a blocker edge
  is unresolved.

## Identity and ordering

- Durable ids are ULIDs (causal order in the id), matching OME's
  event model so the existing log migrates without renumbering.
- The short ref is the last 7 characters, upper-case, exactly as OME
  does today. All agent-facing text uses the ref.
- Resolution is unique-or-error, with a prefix match that must name
  exactly one entity (git-bug's rule). Ambiguity is an error listing
  candidates, never a guess.

## Migration mapping from OME

| OME today | Model |
|---|---|
| issue/ticket | WorkItem (plus AcceptanceCriterion split out of description) |
| tag | Tag |
| assignee | AgentIdentity + lease holder |
| comment | Execution note or review record |
| goal (upstream) | Objective |
| connected repo | Project remote set plus Workspace |
| sync event | ledger event (source of truth, unchanged) |

The git event log stays the source of truth; this model is the
projection shape (see `DESIGN.md` §8 and the storage ADR in Phase 3).
