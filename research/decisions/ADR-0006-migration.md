# ADR-0006: Migration from OME and upstream Epiq

Status: accepted (draft, pending Phase 3 evidence).
Date: 2026-11-16.

## Context

The rebuild must absorb years of OME state without data loss or
silent renumbering. The existing Epiq to OME migration
(`source/lib/migration/migrate-epiq.ts`) is the only sanctioned
writer to the state branch outside the normal event path, and it
renames locations rather than rewriting content. The new product
changes the data model (work items, criteria, ledger, leases) while
keeping the event log as source of truth.

## Decision

1. **Two hops, not one.** Epiq -> OME (done, shipped) -> new
   product. The new hop is a separate migration with its own dry run,
   backup, and rollback.
2. **The event log is copied, not rewritten.** Events are immutable;
   the migration appends derived events for the new model (work item
   creation, criterion split) but never edits old lines. References
   are preserved by id.
3. **Freeze gate during migration.** Imports and sync are blocked
   while a migration is in flight (beads' pattern). One migration at
   a time.
4. **Dry run first, apply second.** Dry run prints the plan, counts,
   and fidelity limits. Apply requires explicit confirmation. This
   matches the current Epiq to OME migration.
5. **Backup before apply.** A full copy of the state worktree, plus
   the recent-projects file. Rollback instructions printed.
6. **Fidelity limits written down before apply.** Known losses:
   - OME has no leases; existing assignments become `ready` or
     `in_progress` without synthetic leases.
   - OME has no acceptance criteria; descriptions are split only
     when they contain explicit criteria, otherwise the whole
     description becomes the spec.
   - Comments and attachments become evidence or notes with validity
     `unverified`.
   - Nothing is marked `done` during migration; completion must be
     re-earned under the new rule.
   - The duplicate-write anomaly is deduped by event id during the
     hop, with a count reported.
7. **Validation after apply.** Counts, references, and a sample
   replay. Failures are reported, not half-applied; the freeze gate
   stays until resolved.
8. **Pending logs are flushed first.** Unflushed `~pending` lines
   (one exists on the homelab board) are flushed before migration so
   no state is lost.
9. **Stranded logs are reported.** `findStrandedEventLogs` from the
   current code runs as part of the preflight.

## Rejected alternatives

- **In-place rewrite of the event log**: rejected; events are
  immutable by ADR-0002, and rewriting would destroy the audit trail
  and make rollback impossible.
- **Cross-backend migration as part of this hop**: rejected; the
  storage choice is settled (ADR-0001) and migration between engines
  is a separate initiative, as beads learned.
- **Auto-promotion of old tickets to done**: rejected; completion
  must be re-earned under the evidence rule, otherwise the new rule
  is meaningless on day one.

## Consequences

- The migration is a first-class deliverable with its own test suite,
  not a script bolted on at release.
- The freeze gate requires a lock on the state branch; the existing
  sync lock protocol is reused.
- Migration runs on the operator's machine against local state; it
  never touches a remote.
- Rollback is a branch reset plus a restore of the backup, not a
  reverse migration.
