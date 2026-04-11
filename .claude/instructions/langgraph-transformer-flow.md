# LangGraph Transformer Flow Rules

## Step 1: Verify existing flow

- Require the feature name from the user.
- Check that `src/features/[feature_name]/` exists AND has an existing AI/agent implementation.
- If no existing implementation → tell the user to use `langgraph-execution-flow` instead. **Exit.**

## Step 2: Read and understand the existing flow

Read all files in the feature:
- `trigger.ts` — trigger type, input parsing
- `usecase.ts` — orchestration logic; what it calls and in what order
- `services/` — every service file; understand APIs called, data flow, side effects

Document the behaviors to **preserve**:
- Inputs accepted
- Processing steps (in order)
- Outputs produced
- Side effects (Firestore writes, Remote Config publishes, notifications, etc.)
- Error handling semantics

## Step 3: Plan the replacement

1. Map each existing behavior to a LangGraph node or edge using `.claude/instructions/langgraph-capabilities.md`.
2. Identify efficiency improvements the LangGraph version can provide (parallelization, better routing, cost reduction via model selection, etc.).
3. Write an implementation plan:
    - State schema (preserving all data that currently flows between steps)
    - Node mapping (existing step → LangGraph node)
    - Graph structure, checkpointer choice
    - Integration contract changes (if any) for `usecase.ts`
    - Migration notes: what changes in TypeScript vs what moves to Python
4. Present the plan. **Wait for explicit user approval before implementing.**

## Step 4: Implement

On approval:

1. **Python LangGraph service** under `src/features/[feature_name]/langgraph/`:
    - `state.py`, `nodes.py`, `graph.py`, `config.py`, `requirements.txt`
    - Preserve all behaviors documented in Step 2
    - Apply the full enterprise standards checklist from `.claude/instructions/langgraph.md`

2. **Update `services/`** in TypeScript:
    - Add `langgraph_service.ts` (HTTP client with retry)
    - Deprecate or remove the old AI service if fully replaced — no dead code

3. **Update `usecase.ts`**:
    - Replace old service calls with `LangGraphService`
    - Preserve all side effects in the same order as before

## Step 5: Cost estimate

Produce `.claude/docs/cost-estimates/[feature_name]_cost_estimate.md`:
- Compare old vs new token usage and cost
- Net cost change (savings or increase)
- Expected run frequency and total $

## Step 6: Review doc

Produce `.claude/docs/reviews/[feature_name]_review.md`:
- What changed vs the original implementation
- Behaviors preserved and any intentional changes
- Cost comparison, performance tradeoffs, suggested optimizations

## Step 7: Optional follow-up

Offer to run `langgraph-inspector` to verify against enterprise standards.
