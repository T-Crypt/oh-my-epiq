# Papers: context compaction

Status: reference brief, 2026-11-16. Summaries from the vision doc's
citations (§7.2); full text not retrieved in this session.

## CompactionBench / APEC

Sources: Microsoft Research publication page; preprint PDF (October
2026).

Reported findings: large-scale analysis of coding-agent sessions;
context compaction has a cost in foreground delay and prefix-cache
reuse; APEC prepares fine-grained indexed summaries asynchronously.

Implication adopted in `CONTEXT_CAPSULE_SPEC.md`:

- Stable sections first (the cacheable prefix).
- Prepare context before the agent needs it, where possible.
- Explicit token budgets and append-only deltas.
- Never let generated compaction erase human-authored constraints.

## Compact-Bench

Source: https://arxiv.org/abs/2610.31710; code
https://github.com/cai-jianfeng/compact-bench.

Question: what exact information is lost when a full history is
replaced by a summary, and can the agent still finish the task?

Implication adopted: mechanical extraction of stable facts and
constraints beats relying only on generated summaries. The capsule is
assembled deterministically; suggestions are labelled inference.

## Benchmarks Are Surprisingly Compaction-Friendly

Source: https://arxiv.org/abs/2610.31778.

Question: do common benchmarks hide the cost of lost requirements
because task state is recoverable from the repository?

Implication adopted: the Phase 3 continuation corpus must include
constraints that exist nowhere else in the codebase. Otherwise the
capsule test proves nothing about constraint retention.

## Open questions for Phase 3

- Minimum viable packet size for the hard cases (blocking constraints
  plus criteria).
- Assembly latency target: must stay well under the agent's own step
  time, or the capsule will be bypassed.
- How to measure constraint retention without a model judging prose.
