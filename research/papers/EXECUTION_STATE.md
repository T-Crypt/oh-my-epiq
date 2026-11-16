# Papers: execution state and state validity

Status: reference brief, 2026-11-16. Summaries are taken from the
vision doc's citations (OME_NEXT.md §7.1, §7.3). Full text was not
retrieved in this session; treat the numbers as the authors' claims,
not verified results. Retrieval and extraction are a Phase 3 task.

## Turning Interaction History into Execution State

Source: https://arxiv.org/abs/2608.00808 (preprint, August 2026).

Claimed idea: convert interaction history into explicit state about
what was observed, modified, and attempted; give the agent a compact
state view before the next action; detect redundant actions and reuse
valid results.

Why it matters here: this is the ledger thesis. `EXECUTION_LEDGER_SPEC.md`
is the concrete form: records carry inputs and validity, and reuse
requires matching inputs.

Caveat carried forward: benchmark gains are the authors' evaluation.
The rebuild must reproduce the behavior on its own corpus (Phase 3),
not inherit the number.

## StateWise: diagnosing and repairing persistent operational state

Source: https://arxiv.org/abs/2610.05241.

Claimed idea: persistent operational records become invalid when the
environment or requirements change; verify important records before
acting, repair incorrect state with provenance, and keep a lineage of
corrections.

Why it matters here: the validity states and invalidation rules in
`EXECUTION_LEDGER_SPEC.md` are the design answer. Two details are now
hard requirements:

1. **Verify before acting.** A consumer checks validity before reuse,
   not after.
2. **Repair with lineage.** A correction is a new record that links to
   the record it corrects. Nothing is overwritten.

## Open questions for Phase 3

- What input scope makes a validity check cheap enough for the 400k
  event bar?
- Which changes matter (file hash) versus which do not (mtime, commit
  message)? Hash-based scope, decided already, needs a cost measure.
- How should contradictions between two valid-looking observations be
  surfaced to a human without a model in the loop?
