# Lease manager spike

Throwaway prototype of the lease manager from
`research/specs/WORKFLOWS.md` (lease protocol section),
`research/specs/CORE_DOMAIN_MODEL.md` (Lease entity), and
`research/decisions/ADR-0004-leases.md`.

## Run

```
node research/prototypes/lease-manager/proto.mjs
```

No dependencies. Pure Node.

## What it measures

- In-memory lease manager: CAS claim, release, heartbeat, expiry sweep,
  monotonic fencing token per work item, stale-owner rejection on write,
  idempotency by request id, shared lease policy, recovery by replaying
  an append-only log.
- Concurrency: 100 simultaneous claims on one work item, assert one win
  and 99 structured conflicts naming the holder.
- Stale-owner: holder A claims, lease expires, holder B claims, A's
  late write with the old token is rejected and names B.
- Idempotency: a retried request id returns the original result and
  appends nothing to the log.
- Recovery: drop in-memory state, rebuild from the log, assert expired
  leases are marked expired and the work item returns to ready.
- Benchmark: 10,000 claim/release cycles, report ms/cycle.

Run three times (cold, warm, warm) and record raw output in
`research/benchmarks/raw/lease-manager-run{1,2,3}.txt`.
