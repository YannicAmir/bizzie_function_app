# LangGraph Execution Flow Rules

## Step 1: Feature check

- Require the feature name from the user.
- Verify the feature exists in `src/features/`.
- If it does **not** exist:
    - If the user also wants a Cloud Function scaffold → tell them to use `langgraph-feature-builder` instead (builds both GCF and LangGraph together). **Exit.**
    - If they only want the LangGraph Python service without a GCF scaffold (rare) → note that `src/index.ts` registration will be needed separately, then proceed.

## Step 2: Behavioral description

- Require a high-level behavioral description: what goes in, what steps the agent takes, what comes out.
- The user does not need to specify technical patterns — infer the right LangGraph capabilities from the description using `.claude/instructions/langgraph-capabilities.md`.
- If missing → ask. If still missing after asking → **exit**.

## Step 3: Read & plan

1. Read the feature's `trigger.ts`, `usecase.ts`, and `services/` files.
2. Read `.claude/instructions/langgraph-capabilities.md` → map the behavioral description to the right patterns (chain, router, agent, map-reduce, etc.) with brief rationale for each choice.
3. Write an implementation plan:
    - State schema (key fields, types, reducers if needed)
    - Nodes (name, purpose, LLM or deterministic)
    - Graph structure (edges, conditional edges, cycles with max_steps)
    - Checkpointer choice (Redis or Postgres — not MemorySaver in production)
    - Integration: how `usecase.ts` will call the Python service (`langgraph_service.ts`)
    - Python file layout under `src/features/[feature_name]/langgraph/`
4. Present the plan. **Wait for explicit user approval before implementing.**
5. Answer questions; revise plan if needed. Do not proceed until the user explicitly approves.

## Step 4: Implement

On approval:

1. **Python LangGraph service** under `src/features/[feature_name]/langgraph/`:
    - `state.py` — TypedDict or Pydantic state; typed, minimal, no full raw payloads
    - `nodes.py` — pure node functions; return partial state updates; async where appropriate
    - `graph.py` — StateGraph, edges, `compile(checkpointer=...)`; `max_steps` guard on any cycles
    - `config.py` — model IDs, limits, flags from env/remote config; no hardcoded production values
    - `requirements.txt` — pinned dependencies
    - Apply the full enterprise standards checklist from `.claude/instructions/langgraph.md`

2. **TypeScript HTTP client** at `src/features/[feature_name]/services/langgraph_service.ts`:
    - POST `{ input, thread_id, config }` to the LangGraph service URL
    - Use `src/core/retry.ts` for retries
    - Validate and type the response
    - URL from env/config — never hardcoded

3. **Update `usecase.ts`**:
    - Call `LangGraphService` with a `thread_id` scoped per run
    - Handle the typed response; pass data to downstream services
    - No direct LangGraph/Python knowledge — only the HTTP contract

## Step 5: Cost estimate

Produce `.claude/docs/cost-estimates/[feature_name]_cost_estimate.md`:
- Per-node token estimates (input, output, cycles)
- Total per run, run frequency, estimated $ per day/month

## Step 6: Review doc

Produce `.claude/docs/reviews/[feature_name]_review.md`:
- Implementation summary (graph structure, patterns used, why)
- Cost summary, performance tradeoffs, known risks, suggested optimizations

## Step 7: Optional follow-up

Offer to run:
- `langgraph-cost-estimator` for a detailed cost breakdown
- `langgraph-inspector` for a standards compliance check
