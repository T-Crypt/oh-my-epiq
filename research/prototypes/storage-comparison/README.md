# Storage comparison spike

Throwaway benchmark comparing log replay against a SQLite projection at
the upstream CI bar: 400,000 events, read under 2 seconds.

## Run

```
node research/prototypes/storage-comparison/bench.mjs
```

No dependencies. Uses `node:sqlite` (built-in). Writes
`generated-events.jsonl` and `projection.db` beside the script.

## What it measures

- Log replay: read all lines, `JSON.parse`, sort by `eventId`, dedupe by
  id. Reports parse ms, sort ms, total ms, peak RSS.
- SQLite projection: builds `work_items`, `work_item_tags`, `edges`,
  `observations` tables with the required indexes in one transaction.
  Reports build time and DB size.
- Four projection queries: short-ref suffix lookup, qualifier filter
  (status=ready AND tag), readiness (deps all done), ledger lookup for
  one work item. Each reported in ms with rows returned.
- Pass/fail against the 2 s bar for each measurement.

Run three times (cold, warm, warm) and record raw output in
`research/benchmarks/raw/storage-comparison-run{1,2,3}.txt`.
```
path">
/home/tcrypt/projects/oh-my-epiq/research/prototypes/storage-comparison/README.md