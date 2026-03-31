---
name: LangGraph Transformation Steps
description: Process for refactoring existing AI/GCF features into LangGraph agentic flows.
---

# LangGraph Transformation Steps

Follow these phases to transform an existing AI/GCF feature into the LangGraph-native architecture.

---

## Phase 1: Feature Discovery & Analysis

1.  **Verify Flow**: Get the feature name from the user and ensure it has an existing AI implementation.
2.  **Analyze Legacy Flow**: Identify all existing inputs, processing steps, outputs, and side effects.
3.  **Document Behaviors**: Map current TypeScript logic and AI service calls.

---

## Phase 2: Design & Planning

1.  **Map Pattern**: Choose the corresponding LangGraph pattern (Chain, Router, Agent, etc.) that best replicates or improves the existing logic.
2.  **Define Migration Strategy**: Identify which logic remains in GCF and which logic moves to the Python layer.
3.  **Unified Plan**: Present the plan to the user for approval.

---

## Phase 3: Implementation

1.  **Build Python Implementation**:
    - Create `state.py`, `nodes.py`, `graph.py`, `config.py`, and `requirements.txt`.
    - Preserve all original side effects and logic flows.
2.  **Update TypeScript GCF**:
    - Add `langgraph_service.ts` to implement the HTTP communication.
    - Deprecate or remove the original AI service logic.
    - Update `usecase.ts` to invoke the new LangGraph service while maintaining original side effect order.

---

## Phase 4: CI/CD & Documentation

1.  **Register Graph**: Update `langgraph.json`.
2.  **Generate Documentation**:
    - Build a cost estimate comparing old token usage vs. new token usage.
    - Complete a production review document.

---

## Verification Checklist

- [ ] Target feature and existing logic are fully understood.
- [ ] LangGraph implementation follows standard file layout and naming.
- [ ] Nodes are `async` and return partial updates.
- [ ] Original side effects in GCF are preserved in correct order.
- [ ] `langgraph_service.ts` uses the core retry pattern.
- [ ] GCF `usecase.ts` communicates only via the HTTP contract.
- [ ] `langgraph.json` is updated.
- [ ] Cost estimate comparing old vs. new is produced.
- [ ] All paths are project-root-relative.
