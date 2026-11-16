# MCP protocol brief

Status: reference brief, 2026-11-16. Source: OME_NEXT.md §7.5
(MCP 2026-07-28). SDK support was not re-verified in this session;
that is a Phase 3 task.

## What changed in 2026-07-28

- Stateless protocol core.
- Explicit request metadata.
- Cacheable, deterministic list responses.
- Authorization hardening.
- Formal extensions framework.
- Tasks as an extension.
- Deprecations: Roots, Sampling, Logging.

## Implications for the rebuild

1. Keep application state in resource ids and tool arguments, not in
   a long-lived transport session. Matches the capsule/ledger design
   (state is in the log and projection, not the connection).
2. Cacheable, deterministic list responses are already a requirement:
   `ome_issue_list` and `ome_issue_get` must be deterministic for the
   same board state, so a client can cache. This matches the
   deterministic-output rule in the product requirements.
3. Adopt only what improves local workflows. Tasks-as-extension is
   interesting but must be evaluated against the lease model before
   adoption; the rebuild's lease already gives task ownership, and a
   second ownership concept would conflict.
4. Authorization hardening: the existing origin-guard and host
   allowlist stay, and tailnet-only default stays. No new listener.

## Decisions to make in Phase 3

- Which SDK version supports 2026-07-28, and what breaks on older
  clients.
- Whether to expose the ledger as MCP resources or only as tools.
- Whether task ownership is expressed via the rebuild's leases or via
  the protocol extension. Likely the former, with the extension as
  an adapter if needed.
