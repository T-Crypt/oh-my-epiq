# Storage comparison report

Machine: omarchy, 12th Gen Intel i9-12900HK (12 cores), Linux 7.2.8.
Node v26.8.2. 3 runs (cold, warm, warm); medians below.

## Workload

400,000 synthetic events in the OME envelope (`{v, id:[eventId, refId], ...payload}`).
Actions: 80k create work item, 80k add tag, 80k set status, 80k add
dependency edge, 80k record observation. ULID-ish ids (26-char Crockford
base32), so sort order holds. 80,000 work items projected.

## Log replay (median of 3)

| Measurement | Median ms | Bar 2000 ms | Result |
|---|---:|---:|---|
| parse | 392.83 | 2000 | PASS |
| sort | 204.76 | 2000 | PASS |
| total | 554.26 | 2000 | PASS |
| peak RSS | 538.1 MB | - | - |

All 400,000 lines parsed and 400,000 unique ids after dedupe. Replay
stays well under the 2 s bar; parse dominates, sort is second.

## SQLite projection (median of 3)

Build: 807.96 ms in one transaction. DB size on disk: 40.46 MB.

| Query | Median ms | Rows | Result |
|---|---:|---:|---|
| (i) short-ref suffix lookup | 6.20 | 1 | PASS |
| (ii) qualifier filter (ready + tag) | 11.74 | 1904 | PASS |
| (iii) readiness (deps all done) | 87.59 | 11428 | PASS |
| (iv) ledger lookup (one work item) | 0.14 | 1 | PASS |

Tables: `work_items`, `work_item_tags`, `edges`, `observations`.
Indexes: `(id)`, `(status)`, `(tag)`, `(fromId,type)`, `(toId,type)`,
`(workItemId,kind,validity)`. All four queries are two orders of
magnitude under the bar.

## Recommendation

The hybrid ADR (ADR-0001) holds. Log replay is 554 ms at 400k events
and every indexed projection query is under 100 ms, so the 2 s read SLO
is met with room to spare. Keep the append-only log as source of truth
and SQLite as the local rebuildable projection. No reason to reopen.

Dolt was not benchmarked (not installed on this box) and remains a
documented candidate per ADR-0001; reconsider only if a later workload
needs branching queries or multi-writer collaboration that the log plus
projection cannot serve.

Raw runs: `research/benchmarks/raw/storage-comparison-run{1,2,3}.txt`.
```
path">
/home/tcrypt/projects/oh-my-epiq/research/benchmarks/reports/STORAGE_COMPARISON.md