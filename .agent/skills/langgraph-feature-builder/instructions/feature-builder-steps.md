---
name: LangGraph Feature Builder Steps
description: Unified workflow for implementing full-stack backend features with GCF and LangGraph.
---

# LangGraph Feature Builder Steps

Follow these phases to build features that span both the TypeScript and Python layers.

---

## Phase 1: Analysis & Strategy

1.  **Parse Intent**:
    - Identify the feature name and trigger type.
    - Define GCF responsibilities (TypeScript) vs. LangGraph responsibilities (Python).
    - Map the agent behavior to a LangGraph pattern (Chain, Router, Agent, etc.).
2.  **Define Integration Contract**: Propose the HTTP request/response payloads and `thread_id` strategy.
3.  **Unified Plan**: Present a plan covering both layers for user approval.

---

## Phase 2: Implementation (Python Layer First)

1.  **Scaffold LangGraph Service**: Create `src/features/[feature_name]/langgraph/`.
2.  **Implement Python Files**:
    - `state.py`: TypedDict state.
    - `nodes.py`: Async node functions (partial updates).
    - `graph.py`: StateGraph assembly and compilation.
    - `config.py`: Environment configuration.
    - `requirements.txt`: Pinned dependencies.
3.  **Verification**: Ensure all files meet **LangGraph Enterprise Standards**.

---

## Phase 3: Implementation (TypeScript Layer)

1.  **Implement LangGraph Client**: Create `src/features/[feature_name]/services/langgraph_service.ts`.
2.  **Implement UseCase**: Create `usecase.ts` to orchestrate flows and call the LangGraph service.
3.  **Implement Trigger**: Create `trigger.ts` for GCF entry points.
4.  **Register & Build**: Export the trigger from `src/index.ts` and run `npm run build`.

---

## Phase 4: CI/CD & Documentation

1.  **Register Graph**: Update `langgraph.json` at the project root.
2.  **Deploy Setup**: Verify GitHub Actions workflow for Cloud Run deployment.
3.  **Cost Estimation**: Create a cost estimate document in `.claude/docs/cost-estimates/`.

---

## Verification Checklist

- [ ] Feature files are placed correctly in both `src/features/` and its `langgraph/` sub-directory.
- [ ] LangGraph state is a `TypedDict`.
- [ ] All Python nodes are `async` and return partial updates.
- [ ] GCF `usecase.ts` communicates only via the HTTP contract.
- [ ] `thread_id` is scoped per run for idempotency.
- [ ] `langgraph.json` is updated with the new graph.
- [ ] Cost estimate document created.
- [ ] All paths are project-root-relative.
