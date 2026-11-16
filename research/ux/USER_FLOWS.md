# User flows

Three primary flows. Each lists steps and decision points.

## Flow 1: Solo operator

1. Open the board. See lanes and goals.
2. Pick a work item. Read its capsule (header, intent, constraints, criteria).
3. Claim it. Lease acquired, fencing token issued.
4. Do the work. Run commands. Ledger records observations.
5. Verify criteria. Each gets a verdict.
6. Mark done only when all criteria pass with fresh evidence.
7. Release the lease on completion.

Decision points:
- Claim fails (already claimed): read conflict, wait or pick another item.
- Criterion fails: return to step 4, do not close.
- Budget too small for capsule: minimum size reported; request more or trim.

## Flow 2: Human plus agent

1. Human sets the goal and writes acceptance criteria.
2. Agent assumes an identity.
3. Agent reads the capsule for the assigned item.
4. Agent executes. Records observations and attempts in the ledger.
5. Agent reports a suggested next action (labelled inference).
6. Human reviews evidence and decides.
7. Human or agent verifies criteria.
8. Close when verified.

Decision points:
- Agent hits a context boundary: continue from capsule alone.
- Constraint conflicts with agent plan: constraint wins, escalate.
- Verification stale: refresh and re-run.

## Flow 3: Multi-agent

1. Agents register distinct identities.
2. Each claims a disjoint item. One wins a contested claim.
3. Loser gets a structured conflict and picks another item.
4. Shared leases allow concurrent observation on research items.
5. Handoff event carries capsule id and open questions to the next agent.
6. Each agent verifies its own criteria.
7. Coordinator reviews the board for stalls and reclaims expired leases.

Decision points:
- Claim race: CAS plus fencing token decides the winner.
- Stalled lease: expires, item returns to ready, next agent reclaims.
- Contradicted evidence: surface both records, human resolves.