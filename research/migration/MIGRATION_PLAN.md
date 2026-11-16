# Migration plan

Per ADR-0006. Two hops: Epiq to OME (done), then OME to the new product.

## Scope

Migrate one named board. Runs on the operator's machine against local state. Never touches a remote.

## Preconditions

1. Flush pending logs. Run `~pending` flush on the homelab board first.
2. Run `findStrandedEventLogs` and report any stranded logs.
3. Confirm no migration is in flight. One migration at a time.

## Hop 1: Epiq to OME

Already shipped. Skip unless the source board is still Epiq.

## Hop 2: OME to new product

### Step 1: Dry run

- Command: `ome migrate` (new hop variant).
- Output: plan, counts per entity, fidelity limits, rollback instructions.
- No writes. Operator reviews.

### Step 2: Backup

- Copy the state worktree to `~/.ome-global/backups/<projectId>-<timestamp>`.
- Copy `recent-projects.json`.
- Record the current branch and HEAD SHA.

### Step 3: Freeze gate

- Acquire the state branch lock. Block imports and sync until resolved.

### Step 4: Apply

- Copy the event log. Do not rewrite old lines.
- Append derived events: work item creation, criterion split where explicit.
- Preserve references by id.
- Dedupe duplicate-write anomalies by event id. Report the count.
- Map OME data: comments and attachments become evidence or notes with validity `unverified`; commit links become `exec.changed` with `baseSha` and `outputDigest`.
- Existing assignments become `ready` or `in_progress` with no lease.

### Step 5: Fidelity limits (known losses)

- No leases minted. Assigned items stay leaseless.
- No acceptance criteria unless the description contains explicit ones. Otherwise the whole description becomes the spec.
- Comments and attachments carry validity `unverified`.
- Nothing marked `done`. Completion must be re-earned.
- Duplicate writes deduped by event id.

### Step 6: Validation

- Counts: events, work items, objectives, evidence.
- References: every ref resolves.
- Sample replay of 10 work items through the capsule.
- Report failures. Do not half-apply.

### Step 7: Rollback

- Release the freeze gate only on success.
- On failure: restore the backup, reset the branch to the recorded SHA, print the rollback steps. No reverse migration.

## Open question

Should the dry run emit a machine-readable plan file so a later apply can reuse it? Recommendation: yes, write it to the backup directory. Operator to confirm.