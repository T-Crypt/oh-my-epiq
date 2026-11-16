# Graph model spike

Throwaway prototype of the typed work graph from
`research/specs/CORE_DOMAIN_MODEL.md` and `research/decisions/ADR-0003-graph-model.md`.

## Run

```
node research/prototypes/graph-model/proto.mjs
```

No dependencies. Pure Node.

## What it measures

- In-memory typed graph: `WorkItem` nodes with status, edges of types
  `depends_on`, `blocks`, `parent_of`, `implements`, `supersedes`,
  `constrained_by`. Each edge is a record with `from`, `to`, `type`,
  `author`, `timestamp`.
- Cycle detection on write for `depends_on`, `blocks`, `parent_of`,
  `supersedes`. Rejects the edge and prints the cycle path.
- Deterministic readiness function (CORE_DOMAIN_MODEL.md Readiness):
  spec present or draft exemption, all `depends_on` targets done (or
  waived), no open blockers, required context resolves, repo access,
  lease policy permits, no contradictory or failing fresh verification.
- Benchmark: 10,000 work items with ~3 random dependency edges per item.
  Measures cycle detection time per edge, full readiness sweep, memory.
- Pass/fail against targets: cycle detection under 1 ms per edge, full
  readiness sweep under 500 ms at 10k items.

Run three times (cold, warm, warm) and record raw output in
`research/benchmarks/raw/graph-model-run{1,2,3}.txt`.
