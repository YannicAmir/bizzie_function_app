---
name: LangGraph Enterprise Standards
description: Platinum-grade standards for state management, persistence, governance, and cost efficiency in LangGraph implementations.
---

# LangGraph Enterprise Standards

All LangGraph implementations must adhere to these standards to ensure production reliability, scalability, and observability.

---

## 1. State Management
- **Typed state only**: Use `TypedDict` for graph state. No untyped dicts.
- **Minimal state**: Store only what nodes need (references/IDs, not full payloads).
- **Pure node updates**: Nodes must return **partial state dicts**. Never mutate input state in-place.
- **Boundary validation**: Validate data at graph entry/exit and when integrating with external systems.

## 2. Persistence & Checkpointing
- **Durable Checkpointer**: Mandatory for production. Use **Redis** (low latency) or **Postgres** (strong consistency/audit).
- **TTL Control**: Configure TTL so state does not grow unbounded over time.
- **Stateless Workers**: All execution state must reside in the checkpointer.

## 3. Graph Structure & Flow
- **Bounded Cycles**: Every cycle must have a `recursion_limit` guard and clear exit conditions.
- **Conditional Edges**: Use branching only when the path depends on state or logic.
- **Circuit Breakers**: Implement backoff or circuit breakers on nodes that repeatedly fail.

## 4. Governance & Safety
- **Guardrails**: Input/output content filtering and PII masking before/after LLM calls.
- **Tracing**: Enable **LangSmith** in all non-local environments.
- **Audit Trails**: Log checkpoint metadata and state transitions for auditing.
- **Human-in-the-loop**: Use `interrupt()` for critical decisions or high-risk actions.

## 5. Cost & Efficiency
- **Context Budget**: Trim, filter, or summarize message history to prevent O(n²) token growth.
- **Model Tiering**: Use smaller/cheaper models for routing and classification; reserve larger models for complex generation.
- **Cost Estimation**: Every new or changed flow must have an associated cost estimate.

## 6. Observability & Quality
- **Structured Logging**: Track node entry/exit and latency with correlation IDs.
- **Metrics**: Monitor token usage, error rates, and retry counts.
- **Python Quality**: Python 3.11+, full type hinting, async execution, and exact dependency pinning.

---

## Compliance Checklist

- [ ] Typed state (`TypedDict`) used throughout.
- [ ] Nodes return partial updates (no mutation).
- [ ] Durable checkpointer (Redis/Postgres) configured.
- [ ] `recursion_limit` guard implemented on all cycles.
- [ ] LangSmith tracing enabled.
- [ ] Context budget and model tiering justified.
- [ ] Cost estimate exists.
- [ ] Async/await used throughout the flow.
- [ ] No secrets or PII in logs/state.
- [ ] `thread_id` scoped per feature run.
