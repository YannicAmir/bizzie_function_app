# LangGraph Enterprise Standards (Platinum Grade)

All LangGraph implementations in this project **must** adhere to these standards. The `langgraph-inspector` agent checks implementations against them.

---

## 1. State management

- **Typed state only:** `TypedDict` for graph state. No untyped dicts. Pydantic only at HTTP boundaries.
- **Minimal state:** Only store what nodes need. References/IDs, not full raw payloads.
- **Pure node updates:** Nodes return **partial state dicts** (key → value). Never mutate input state.
- **Reducers only when needed:** Use `add_messages` and similar only for accumulation; simple assignment for replace semantics.
- **Validation at boundaries:** Validate at node entry/exit when integrating with external systems.

---

## 2. Persistence & checkpointing

- **No `MemorySaver` in production.** Use a durable checkpointer:
  - **Redis:** `langgraph-checkpoint-redis` — horizontal scaling, sub-ms latency.
  - **PostgreSQL:** `langgraph-checkpoint-postgres` — audit trails, strong consistency.
- **TTL and refresh:** Configure TTL and refresh-on-read so state does not grow unbounded.
- **Stateless workers:** All state in the checkpointer — any worker can continue any run.

---

## 3. Graph structure & flow control

- **Simple edges for linear steps.** Conditional edges only when the next node depends on state or LLM output.
- **Bounded cycles:** Every cycle must have:
  - A `recursion_limit` (passed in invoke config) guard.
  - Clear exit conditions.
  - Optional: exponential backoff or circuit breaker on repeated failures.

---

## 4. Governance & safety

- **Guardrails:** Input/output guardrails (content filters, PII) before and after LLM calls where required.
- **Human-in-the-loop:** Use `interrupt()` for approval or critical decisions; document which nodes interrupt and when.
- **Tracing:** Enable LangSmith in non-local environments; use consistent project names.
- **Audit:** Checkpoint metadata + structured logging so runs can be audited (who, when, state, path).

---

## 5. Cost & efficiency

- **Context budget:** Trim/filter/summarize message history. Avoid O(n²) token growth.
- **Model choice:** Smaller/cheaper models for routing, classification, simple steps. Larger for complex generation only.
- **Caching:** Use prompt/response caching where supported.
- **Cost estimate required:** Every new or changed flow must have a cost estimate file in `.claude/docs/cost-estimates/`.

---

## 6. Observability & operations

- **Structured logging:** Node entry/exit, key state fields (no secrets), errors with correlation IDs.
- **Metrics:** Latency, token usage, error rate, interrupt/resume events.
- **Idempotency:** Design nodes and side effects so retries do not duplicate external actions.

---

## 7. Python & code quality

- **Python 3.11+.** Type hints on all public functions and state types.
- **Async:** Use async graph and async checkpointer in async serving environments (Cloud Run).
- **No secrets in state or logs.** Never log or store API keys, tokens, or PII.
- **Dependency pinning:** Exact versions in `requirements.txt`.

---

## 8. Integration with Bizzie Function App

- LangGraph flows must align with the feature's `trigger.ts` / `usecase.ts` / `services/` layering.
- TypeScript GCF layer and Python LangGraph layer are separate runtimes connected only via HTTP.
- Document the integration contract (API shape, auth, idempotency) in `langgraph_service.ts`.
- Use environment/remote config for model IDs, limits, and feature flags — no hardcoded production values.

---

## Compliance checklist (use before marking complete)

**State**
- [ ] Typed state — `TypedDict`, no untyped dicts
- [ ] Minimal state — references/IDs not full payloads
- [ ] Nodes return partial updates — no in-place mutation
- [ ] Reducers only for accumulation
- [ ] Boundary validation at external integrations

**Persistence**
- [ ] No `MemorySaver` in production
- [ ] Durable checkpointer (Redis or Postgres) with TTL
- [ ] Stateless workers

**Graph structure**
- [ ] Simple edges for linear steps
- [ ] Conditional edges only for real branching
- [ ] Cycles have `recursion_limit` guard and clear exit conditions

**Governance**
- [ ] Input/output guardrails where required
- [ ] `interrupt()` documented for human-in-the-loop nodes
- [ ] LangSmith tracing enabled in non-local environments
- [ ] Audit trail via checkpoint metadata + logging

**Cost & efficiency**
- [ ] Context budget enforced
- [ ] Model choices justified
- [ ] Cost estimate file exists in `.claude/docs/cost-estimates/`

**Observability**
- [ ] Structured logging at node entry/exit (no secrets)
- [ ] Metrics tracked
- [ ] Idempotent side effects

**Python quality**
- [ ] Python 3.11+, type hints everywhere
- [ ] Async throughout
- [ ] No secrets in state or logs
- [ ] Dependencies pinned

**Integration**
- [ ] No graph code in TypeScript
- [ ] `langgraph_service.ts` uses retry pattern
- [ ] `thread_id` scoped per run
- [ ] Cloud Function timeout > max graph execution time