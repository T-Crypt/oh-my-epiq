# Lease manager spike report

Machine: 12th Gen Intel Core i9-12900HK, Linux x64. Node v26.8.2.

## Concurrency
100 simultaneous claims on one work item: 1 winner, 99 structured
conflicts. Every conflict names the winning holder, fencing token,
and expiry. No silent overwrite. PASS.

## Stale-owner
Holder A claimed (token 1, TTL 10 ms). After expiry, holder B
claimed (token 2). A's late write with token 1 was rejected with
reason `stale_token` and named holder B. PASS.

## Idempotency
Retrying with the same request id returned the identical result and
appended nothing to the log; only one lease was created. PASS.

## Recovery
Crash simulated by dropping projections; rebuild from the log marked
the expired lease `expired` and returned the work item to `ready`;
fencing token preserved. PASS.

## Benchmark
10,000 claim/release cycles: 0.0141-0.0162 ms/cycle (run median
0.0149), ~67k cycles/sec. In-memory only; no I/O or git.

## Verdict
PASS (19/19 assertions). The CAS + monotonic fencing token + TTL +
idempotency + log-replay recovery design holds at this scale. Shared
lease policy allows concurrent claims without conflict. No design
changes required; the real implementation must add the (workItemId,
fencingToken) index and a background sweep agreeing with read-time
expiry, per ADR-0004.
