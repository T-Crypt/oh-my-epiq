# MCP contract

Status: draft for Phase 3 review. Implements OME_NEXT.md §10.2 and the
product requirements.

## Surface shape

Two-tier, following beads' progressive disclosure:

- `discover` (names + one-liners) and `get_info` (full parameter
  detail for one tool) are the entry points.
- Every domain tool is brief by default, `view:full` for depth.
- Lists are compact: ref, title, state, counts. Full payloads on
  request only.
- Replies name every node by its short ref, per upstream #531.

## Tool set (P0)

| Group | Tools |
|---|---|
| Identity | `assume_actor` (provider/label@machine) |
| Work | `work_list`, `work_get`, `work_create`, `work_update`, `work_ready`, `work_block`, `work_unblock`, `work_cancel` |
| Leases | `work_claim`, `work_release`, `work_handoff`, `lease_show` |
| Ledger | `ledger_show`, `ledger_record`, `capsule` |
| Evidence | `evidence_show`, `verify` |
| Decisions/constraints | `decision_add`, `constraint_add` |
| Objectives | `objective_list`, `objective_get`, `objective_create` |
| Sync | `sync`, `doctor` |
| Discovery | `discover`, `get_info`, `skill_install` |

Total: about 24 in P0. Up from 19 default / 36 full in OME, but each
reply is smaller and the surface is discoverable.

## Rules

- `assume_actor` must be called before the first write, as today.
- Writes accept full id or 7-char ref. Ambiguity is an error naming
  candidates.
- `work_list` accepts DQL-style qualifiers in one string argument
  (`query`): `status:ready tag:critical assignee:hadaL sort:created`.
  No one-tool-per-combination.
- `work_ready` is a named first-class tool, not a filter.
- Mutations are serialized per actor via `exclusiveTool`/`runExclusive`,
  as today.
- No LLM call in any tool. Capsule and ledger are deterministic.
- Descriptions ride with `assume`, `get`, `create`, and `move` (upstream
  #0KQT1XV): boards and lanes carry a description handed to the agent.
- Tool list responses are deterministic and cacheable (MCP
  2026-07-28): same board state, same bytes.

## What is not in P0

GraphQL door, vector retrieval, hosted sync, notifications, analytics,
embedded agent runtime.
