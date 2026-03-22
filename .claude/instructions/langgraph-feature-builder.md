# LangGraph Feature Builder Rules

## Role
Self-contained orchestrator for building new features that require BOTH a Cloud Function scaffold AND a LangGraph agent flow. Covers both stacks end-to-end in a single unified workflow.

---

## Phase 1: Parse intent

Extract from the user's mermaid diagram and/or context:
- **Feature name** (snake_case) — confirm or propose if not explicit
- **Trigger type** — Cloud Scheduler, HTTP, Webhook, etc.
- **GCF layer responsibilities** — what does `trigger.ts` / `usecase.ts` handle? (auth, input parsing, saving results, notifications, etc.)
- **LangGraph layer responsibilities** — what does the agent do? (classify, reason, multi-step LLM calls, tool use, routing, etc.)
- **Integration contract** — what does `usecase.ts` send to LangGraph, and what does it get back?

If the mermaid/context is ambiguous about the GCF vs LangGraph boundary, ask one focused clarifying question before planning.

---

## Phase 2: Unified plan

Produce a single plan covering both layers. Use `.claude/instructions/langgraph-capabilities.md` to map agent behavior to specific LangGraph patterns with brief rationale.

**Plan structure:**

### GCF Layer (TypeScript)
- `trigger.ts` — trigger type, input parsing, error handling
- `usecase.ts` — orchestration: call LangGraph → handle response → call downstream services
- `services/langgraph_service.ts` — HTTP client contract: request payload shape, response shape, thread_id strategy
- Other services needed (Firestore, Remote Config, external APIs)
- `src/index.ts` — export name

### LangGraph Layer (Python)
- State schema — key fields, types, which use reducers
- Nodes — name, purpose (LLM or deterministic), model choice and why
- Graph topology — edges, conditional edges, any cycles (with max_steps)
- Checkpointer — Redis or Postgres (never MemorySaver in production)
- Python file layout under `src/features/[feature_name]/langgraph/`

### Integration contract
- HTTP endpoint: request `{ input: {...}, thread_id: string, config?: {...} }`
- Response: `{ output: {...}, run_id: string, metadata?: {...} }`
- Auth mechanism (GCP IAM ID token or Secret Manager secret)
- Cloud Function timeout vs estimated max graph execution time

**Present the plan. Wait for explicit user approval. Do not write any code until the user says to proceed.**

Answer questions and revise if needed. Do not implement until approved.

---

## Phase 3: Implement (in this order)

Implement Python first — the TypeScript integration is written against the known contract.

### Step 1: Python LangGraph service

Create `src/features/[feature_name]/langgraph/`:

- **`state.py`** — TypedDict or Pydantic state; typed, minimal, no full raw payloads
- **`nodes.py`** — pure node functions; return partial state updates; no in-place mutation; async where serving environment is async
- **`graph.py`** — StateGraph, edges, conditional edges, `compile(checkpointer=...)`; `max_steps` guard on any cycles
- **`config.py`** — model IDs, limits, flags from env/remote config; no hardcoded production values
- **`requirements.txt`** — pinned dependencies

Apply the full enterprise standards checklist from `.claude/instructions/langgraph.md` as each file is written.

### Step 2: TypeScript GCF scaffold

Create `src/features/[feature_name]/`:

- **`services/langgraph_service.ts`**:
    - Thin HTTP client — POST `{ input, thread_id, config }` to the LangGraph service URL
    - Use `src/core/retry.ts` for retries
    - Validate and type the response
    - URL from env/config — never hardcoded

- **`usecase.ts`**:
    - Call `LangGraphService` with a `thread_id` scoped per run (e.g., `[feature_name]_[date]_[id]`)
    - Handle the typed response; pass data to downstream services
    - No direct LangGraph/Python knowledge — only the HTTP contract
    - Pure TypeScript; no cloud imports

- Other services (Firestore, Remote Config, etc.) following `src/core` patterns

- **`trigger.ts`**:
    - Cloud Function entry point (Schedule / HTTP / Webhook per the plan)
    - Parse input, call usecase, handle top-level errors and log them
    - No business logic

### Step 3: Register and verify

- Export the trigger from `src/index.ts`
- Run `npm run build` — fix any TypeScript errors before proceeding

### Step 4: Register the graph in langgraph.json

Update `langgraph.json` at the project root to add the new graph to the `graphs` field:

```json
{
  "python_version": "3.11",
  "dependencies": ["."],
  "graphs": {
    "[feature_name]": "./src/features/[feature_name]/langgraph/graph.py:graph"
  }
}
```

If other graphs already exist in the `graphs` field, add the new entry alongside them — never replace existing entries.

### Step 5: Add Cloud Run deployment to CI/CD

Check `.github/workflows/deploy-functions.yml`. If a "Deploy LangGraph Services to Cloud Run" step does not already exist, add it after the "Deploy to Firebase" step:

```yaml
      - name: Deploy LangGraph Services to Cloud Run
        run: |
          GRAPH_COUNT=$(python3 -c "import json; d=json.load(open('langgraph.json')); print(len(d.get('graphs', {})))")
          if [ "$GRAPH_COUNT" -gt "0" ]; then
            echo "Deploying $GRAPH_COUNT LangGraph service(s) to Cloud Run..."
            python3 -c "import json; d=json.load(open('langgraph.json')); [print(k) for k in d.get('graphs', {}).keys()]" | while read GRAPH; do
              echo "Deploying langgraph-$GRAPH..."
              gcloud run deploy langgraph-$GRAPH \
                --source ./src/features/$GRAPH/langgraph \
                --region us-central1 \
                --no-allow-unauthenticated \
                --update-secrets=LANGSMITH_API_KEY=LANGSMITH_API_KEY:latest,LANGSMITH_PROJECT=LANGSMITH_PROJECT:latest \
                --quiet
            done
          else
            echo "No LangGraph services registered — skipping Cloud Run deploy"
          fi
```

If the step already exists, do NOT add it again — it is already dynamic and will automatically pick up the new graph from `langgraph.json`.

Also ensure the feature's `langgraph/` directory contains a `Dockerfile` and `main.py` (FastAPI server) — these are required for Cloud Run deployment. See `.claude/instructions/langgraph-python-setup.md` for the standard templates.

---

## Phase 4: Cost estimate

Produce `.claude/docs/cost-estimates/[feature_name]_cost_estimate.md`:
- Per-node token estimates (input, output, cycles)
- Total per run, run frequency, estimated $ per day/month

---

## Phase 5: Review doc

Produce `.claude/docs/reviews/[feature_name]_review.md`:
- Implementation summary: graph structure, patterns chosen and why, GCF integration design
- Cost summary, performance tradeoffs, known risks, suggested optimizations

---

## Phase 6: Optional follow-up

Offer to run:
- `langgraph-cost-estimator` for a detailed cost breakdown
- `langgraph-inspector` to verify the LangGraph layer against enterprise standards
- `test-engineer` to generate unit tests for `usecase.ts`
