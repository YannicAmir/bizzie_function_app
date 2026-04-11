# LangGraph Inspector Rules

## Constraints
- This agent is **read-only** — it inspects and produces a report; it does not modify implementation files unless the user explicitly asks for fixes.
- Every item in the enterprise standards checklist must be checked — no skipping.
- For each critical issue found, offer to implement the fix immediately after producing the report.

---

## Workflow

### Step 1: Locate the implementation

- Get the feature name from the user.
- Read all files under `src/features/[feature_name]/langgraph/` — `state.py`, `nodes.py`, `graph.py`, `config.py`, `requirements.txt`.
- Read `src/features/[feature_name]/services/langgraph_service.ts`.
- Read `src/features/[feature_name]/usecase.ts`.

### Step 2: Run the enterprise standards checklist

Check every item from `.claude/instructions/langgraph-enterprise-standards.md`:

**State management**
- [ ] Typed state (TypedDict / Pydantic) — no untyped dicts
- [ ] Minimal state — no full raw payloads when IDs/refs suffice
- [ ] Pure node updates (partial state, no in-place mutation)
- [ ] Reducers only where needed
- [ ] Boundary validation at external integrations

**Persistence**
- [ ] No MemorySaver in production
- [ ] Durable checkpointer (Redis or Postgres) configured
- [ ] TTL and refresh-on-read configured
- [ ] Stateless workers

**Graph structure**
- [ ] Simple edges for linear steps
- [ ] Conditional edges only for real branching
- [ ] Cycles have max_steps guard and clear exit conditions

**Governance**
- [ ] Input/output guardrails where required
- [ ] `interrupt()` documented for human-in-the-loop nodes
- [ ] LangSmith tracing enabled (non-local)
- [ ] Audit trail via checkpoint metadata + logging

**Cost & efficiency**
- [ ] Context budget enforced (trim/filter/summarize)
- [ ] Model choices justified (smaller for routing, larger for generation)
- [ ] Caching used where applicable
- [ ] Cost estimate file exists in `.claude/docs/cost-estimates/`

**Observability**
- [ ] Structured logging at node entry/exit (no secrets)
- [ ] Metrics: latency, tokens, error rate
- [ ] Idempotent side effects

**Python quality**
- [ ] Python 3.11+, type hints on all functions
- [ ] Async where appropriate
- [ ] No secrets in state or logs
- [ ] Dependencies pinned in requirements.txt

**Integration**
- [ ] No LangGraph graph code in TypeScript
- [ ] `langgraph_service.ts` uses retry pattern
- [ ] `thread_id` scoped per run
- [ ] Cloud Function timeout > max graph execution time

### Step 3: Produce inspection report

Write to `.claude/docs/inspections/[feature_name]_inspection.md`:

```markdown
# LangGraph Inspection: [Feature Name]

**Date:** [today]
**Inspector:** langgraph-inspector agent

## Standards compliance

| Standard | Status | Notes |
|---|---|---|
| Typed state | ✅ / ❌ | ... |
| Durable checkpointer | ✅ / ❌ | ... |
| max_steps guard | ✅ / ❌ | ... |
| LangSmith tracing | ✅ / ❌ | ... |
| Cost estimate exists | ✅ / ❌ | ... |

## Issues found

### Critical (must fix before production)
- [Issue description]

### Recommended (should fix)
- [Issue description]

### Suggestions (nice to have)
- [Issue description]

## Overall verdict

[Ready for production / Needs fixes before production]
```

### Step 4: Offer to fix

For each critical issue found, offer to implement the fix immediately.
