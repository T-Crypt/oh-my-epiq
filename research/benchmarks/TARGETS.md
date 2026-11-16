# Benchmark targets

Each target states a value and a measurement method.

## Replay

- Target: replay 400,000 events in under 2 seconds.
- Method: time the full replay on a 400k-event fixture, CI gate.

## Readiness query

- Target: return the ready set for one board in under 2 seconds at 400k events.
- Method: time the readiness query against the SQLite projection.

## Lease operations

- Target: claim, heartbeat, and release each under 50 ms p99.
- Method: benchmark harness over 1,000 sequential operations.

## Capsule assembly latency

- Target: under 100 ms for a single work item at 400k events.
- Method: time `assembleCapsule` end to end including projection reads.

## Capsule token budget

- Target: default packet under 4,000 tokens; minimum viable packet under 1,000 tokens.
- Method: count tokens of rendered output across the corpus cases.

## Constraint retention

- Target: 100 percent. No capsule drops a blocking constraint. No continuation violates a constraint it was not told about.
- Method: continuation corpus with constraints that exist nowhere else in the codebase. Score by automated check of the final diff and state against the constraint list.

## Stale-fact rate

- Target: zero actions taken on a `stale` ledger record in the corpus.
- Method: log every record consulted during continuation; assert none had validity `stale`, `superseded`, `contradicted`, or `unknown`.