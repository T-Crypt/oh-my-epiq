# ADR-0005: Context capsules, deterministic and LLM-free baseline

Status: accepted (draft, pending Phase 3 evidence).
Date: 2026-11-16.

## Context

Agents either get the whole board or a hand-written brief. Neither
is bounded or source-linked. The rebuild needs a token-budgeted packet
assembled from structured state, without an LLM call for the baseline,
with constraint preservation across compaction.

## Decision

1. **Deterministic assembly.** Same work item, same log state, same
   budget, same bytes. No model call in baseline assembly.
2. **Fixed section order** (cacheable prefix): header, intent,
   constraints, criteria, dependencies, decisions; then evidence,
   attempts, open questions, suggested next action. Sections 1–6 are
   stable; 7–10 vary with execution.
3. **Every line carries a source reference** (entity ref or ledger
   record id). No free-floating facts.
4. **Facts and inference are structurally distinct.** The suggested
   action is always labelled as inference.
5. **Token budget from the caller.** Assembly fills sections in order
   and stops, emitting an omission manifest. Never omitted: header,
   intent, blocking constraints, criteria, active blockers. If the
   budget cannot hold them, report the minimum size instead of
   truncating silently.
6. **Constraint preservation is a hard rule.** `user`-origin and
   `security_policy` constraints are copied verbatim, even when old,
   even under compaction. Generated summaries never erase them.
7. **Full detail is retrievable per section** by ref, not by
   re-running the whole capsule.
8. **Quality is measured on a continuation corpus**, against a
   full-history baseline, on task success, constraint retention,
   token count, latency, and stale-fact rate. Constraint retention
   outranks token savings.

## Rejected alternatives

- **LLM-assembled capsules**: rejected for the baseline. An LLM
  cannot be the source of a packet that is supposed to preserve facts
  deterministically. An LLM may be used later as an optional
  enrichment, never as the core.
- **Unbounded packets**: rejected; context sprawl is the problem.
- **Dropping old constraints to save tokens**: rejected explicitly.
  This is the central failure mode the compaction research
  identifies.
- **One packet shape for all consumers**: rejected; the budget and
  section selection are caller-controlled, so a human review and an
  agent claim can ask for different slices.

## Consequences

- Assembly must be cheaper than the agent's step time, or it will be
  bypassed. Measured in Phase 3.
- The stable prefix exists to improve prompt-cache reuse. Its
  stability is a property of the source entities, not of the assembler.
- Omission manifests are part of the contract: a consumer can see what
  was left out and request it.
- The corpus must include constraints that exist nowhere else in the
  codebase, or the test proves nothing (the compaction-friendly
  benchmark caveat).
