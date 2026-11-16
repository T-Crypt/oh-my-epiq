# CLI contract

Status: draft for Phase 3 review. Implements OME_NEXT.md §10.1 and the
product requirements. JSON output uses a versioned schema; exit codes
are predictable; defaults are concise, `--full` for depth.

## Global

- `--json`: machine-readable output on every command.
- `--full`: full payload instead of brief.
- `--quiet`: no prose, only the result.
- Exit codes: 0 success, 1 user error, 2 not found, 3 conflict (claim
  race, stale token), 4 not ready (lease expired, blocked), 5
  internal error.

## Work graph

```
work create --title <t> [--spec <file>] [--objective <ref>] [--criteria <file>]
work show <ref> [--full]
work list [qualifiers]              # DQL-shaped: status:ready tag:x sort:created
work ready [--assignee <ref>]       # the headline query
work block <ref> <ref>              # depends_on
work unblock <ref> <ref>
work update <ref> [fields]
work cancel <ref> [--reason]
```

## Leases

```
work claim <ref> [--lease-ttl <s>] [--request-id <id>]
work release <ref> [--request-id <id>]
work handoff <ref> --to <actor> [--capsule <budget>] [--keep-lease]
work lease show <ref>
work lease revoke <ref>             # admin, logged
```

## Ledger and evidence

```
ledger show <ref> [--full]          # observations for a work item
ledger record <kind> --command <cmd> --result <r> [--scope ...]
capsule <ref> --budget <tokens> [--section ...]   # assemble capsule
evidence show <id>
verify <ref> --criterion <id> --evidence <id> [--verifier <tool>]
```

## Decisions and constraints

```
decision add --title <t> [--rationale <file>] [--supersedes <ref>]
constraint add --statement <s> --origin <origin> --scope <pattern>
```

## Objectives

```
objective create --title <t> [--success <measure>]
objective show <ref>
objective list
```

## Sync and migration

```
sync [--dry-run]
migrate [--apply] [--dry-run]       # OME -> new product
doctor                              # pending lines, stranded logs, stale leases
```

## Rules

- Every command accepts a full id or the 7-char ref. Ambiguity is an
  error naming candidates.
- Brief is the default. `--full` retrieves depth. `ome issue_list`
  style: no whole board.
- Commands are deterministic. No model call in any CLI command.
- `sync` is the only command that touches the network.
- `doctor` reports; it never repairs without `--repair`.
- Prefix commit subjects with the ticket ref, as today.
