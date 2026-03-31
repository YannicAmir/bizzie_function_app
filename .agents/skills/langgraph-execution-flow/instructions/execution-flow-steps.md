---
name: LangGraph Execution Flow Steps
description: Workflow for designing and implementing agentic flows within the LangGraph architecture.
---

# LangGraph Execution Flow Steps

Follow these phases to design and implement a new LangGraph agent flow.

---

## Phase 1: Context Analysis

1.  **Verify Feature**: Ensure the target feature exists in `src/features/`.
2.  **Analyze Behavior**: Identify the high-level steps, inputs, and outputs for the agent.
3.  **Define Pattern**: Map the behavior to a LangGraph pattern (Chain, Router, Agent, etc.).

---

## Phase 2: Design & Planning

1.  **Draft Implementation Plan**:
    - State schema and reducers.
    - Nodes and their purposes.
    - Graph structure (edges, cycles, and guards).
    - Integration contract for the TypeScript layer.
2.  **Confirm with User**: Seek explicit approval before implementing any code.

---

## Phase 3: Implementation

1.  **Build Python Implementation**:
    - Create `state.py`, `nodes.py`, `graph.py`, `config.py`, and `requirements.txt`.
    - Apply all **LangGraph Enterprise Standards**.
2.  **Implement TypeScript Client**:
    - Create `services/langgraph_service.ts` to handle HTTP communication with the node.
3.  **Update Orchestrator**:
    - Modify `usecase.ts` to invoke the LangGraph client.

---

## Phase 4: CI/CD & Documentation

1.  **Register Graph**: Update `langgraph.json` at the project root.
2.  **Finalize Artifacts**:
    - Build a cost estimate document.
    - Create a documentation review file for the implementation.

---

## Verification Checklist

- [ ] Target feature exists in `src/features/`.
- [ ] LangGraph implementation follows standard file naming and layout.
- [ ] State management uses `TypedDict`.
- [ ] Nodes are `async` and return partial updates.
- [ ] `langgraph_service.ts` uses the core retry pattern.
- [ ] GCF `usecase.ts` communicates only via the HTTP contract.
- [ ] `langgraph.json` is updated.
- [ ] Cost estimate document created.
- [ ] All paths are project-root-relative.
