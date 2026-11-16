# Security and privacy

Status: draft for Phase 2 review. Implements OME_NEXT.md §14 and §18
(trust) and constrains the specs above.

## Principles

- Local first. All state lives on the operator's machine. Network
  access is opt-in per feature.
- No secret capture by default. Commands, outputs, and artifacts are
  treated as sensitive until proven otherwise.
- Distinguishable truth. Observed facts, derived records, and inferred
  suggestions are separate and labelled.
- Auditable. Every change has an actor and a timestamp; history is
  append-only and exportable.
- Small attack surface. One embedded store, one log, no server by
  default.

## Data handled

| Class | Examples | Rules |
|---|---|---|
| Board data | work items, criteria, decisions, constraints | Stored locally in the event log. Exported only on request |
| Execution data | commands, file paths, digests, exit codes | Digested where possible. Raw output kept only with retention set |
| Evidence | test output, diffs, reports, screenshots | Same handling as execution data. Secrets redacted before storage |
| Identity | provider, label, machine, git remotes | Machine names and remotes are config, not public data |
| Tokens | remote access tokens, pairing codes | Stored in the existing GUI access file; never logged |

## Secret handling

- Before an `exec.ran` record is written, argv and environment are
  passed through a sanitizer: known secret patterns (token prefixes,
  key headers, long random strings from configured env names) are
  replaced with a placeholder and the original is not stored.
- Outputs are digested. Raw output is stored only when the user sets a
  retention policy that allows it.
- A lint-style check runs at write time: if a record looks like it
  contains a secret, it is refused with a warning, not silently
  redacted.
- Migration must not copy secrets from the old store without the same
  sanitization.

## Network and sharing

- Sync uses the existing git remotes of the state branch. No new
  listener, no default public exposure.
- Remote access (browser) stays tailnet-only, loopback by default, as
  in the current product.
- Optional hosted sync is a P2 item and requires explicit opt-in plus
  a documented trust boundary.
- A disconnected machine works fully offline. Reconnection merges and
  explains conflicts; it never silently drops events.

## Privacy and identity

- Agent identities carry provider, label, and machine. The operator
  can list them and remove a machine's registration.
- Attribution survives migration; the upstream fork relationship and
  license notices stay intact.
- No telemetry. No usage data leaves the machine.
- Deleting a contributor removes their registration, not their
  historical authorship (history stays, marked as a removed identity).

## Retention and deletion

- Each record carries a retention class: `keep`, `digest_only`,
  `expire_after(days)`.
- Expired raw data is deleted; the digest and the record remain, so
  validity checks still explain what was once known.
- Hard delete of board data is possible only through an explicit
  command that writes tombstones, not by editing files.

## Access control

- Single-user local trust, as today. Multi-user trust is git remote
  trust: whoever can push to the state remote can write events.
- Pairing codes are single-use and short-lived, as in the current
  product.
- No new permission model in P0.

## Migration safety

- Dry run first, apply second, as the current Epiq to OME migration
  does.
- Backup before apply, rollback instructions printed.
- Freeze imports during migration.
- Validate after: counts, references, and a sample replay. Failures
  are reported, not half-applied.

## Trust gate (from vision §18)

- Users can inspect why the system believes a task is ready, blocked,
  complete, or stale. Every such verdict links to its inputs.
- Facts and summaries are distinguishable.
- No secrets captured by default.
- Network exposure is opt-in and protected.
- License inventory for reused code is auditable.
