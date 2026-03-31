---
name: langgraph-cost-estimation-steps
description: Workflow for analyzing and documenting the costs of LangGraph agent flows.
---

# LangGraph Cost Estimation Steps

Follow these phases to analyze and document the costs associated with LangGraph features.

---

## Phase 1: Analysis & Graph Discovery

1.  **Identify Flow**: Map the feature name to its Python implementation under `src/features/[feature_name]/langgraph/`.
2.  **Audit Nodes**: Read `graph.py` and `nodes.py` to identify which nodes make LLM calls and if cycles are possible.
3.  **Evaluate State**: Analyze `state.py` to understand how the state size grows with history.

---

## Phase 2: Token Estimation

1.  **System Prompt Tokens**: Estimate total tokens for prompt templates.
2.  **Input/Output Tokens**: Estimate per-node token usage based on representative data samples.
3.  **Calculate Per-Run Totals**: Sum all node totals, accounting for any potential graph cycles within `recursion_limit` constraints.

---

## Phase 3: Reporting

1.  **Generate Documentation**: Create `.claude/docs/cost-estimates/[feature_name]_cost_estimate.md`.
2.  **Project Operational Expenses**: Calculate daily and monthly costs based on expected execution frequency.
3.  **Identify Optimizations**: Provide recommendations for trimming context or tiering models to reduce costs.

---

## Verification Checklist

- [ ] All LLM-calling nodes are analyzed for token usage.
- [ ] Cycles are accounted for in total per-run estimates.
- [ ] Cost calculation uses current model pricing.
- [ ] Documentation is created in the standard directory.
- [ ] All paths are project-root-relative.
