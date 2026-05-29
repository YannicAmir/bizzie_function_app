---
name: langgraph builder instructions
description: Step-by-step procedure for LangGraphBuilder to implement usecase.ts, nodes/*.ts, and trigger wiring from a langgraph.md spec and supporting spec docs.
---

# Instructions for LangGraphBuilder

## Role

Implement `usecase.ts` and all `nodes/*.ts` files for a LangGraph-based Cloud Function feature. Called by SpecBuildExecutor when a spec folder contains a `langgraph.md` file.

## Steps

1. **Receive inputs from SpecBuildExecutor:**
   - Path to the feature directory (e.g., `src/features/weekly_recap/storage/`)
   - Path to `langgraph.md` spec doc
   - Path to `usecase.md` spec doc
   - Path to `data-models.md` spec doc
   - Paths to all service spec docs (e.g., `ai-service.md`, `fmp-service.md`)

2. **Read all provided spec docs in full** before writing any code.

3. **Read best practice instruction files:**
   - `.claude/organization/technology/shared_instructions/langgraph.typescript.best.practice.instructions.md`
   - `src/core/retry.ts` — retry utility
   - `src/core/logger.ts` — logger
   - `src/core/errors.ts` — error types

4. **Implement `usecase.ts`:**
   - Import `Annotation`, `StateGraph`, `START`, `END` from `@langchain/langgraph`
   - Define `StateAnnotation` using `Annotation.Root` — one field per state key from the spec
   - Export `type State = typeof StateAnnotation.State`
   - Import all service types (interfaces only at this point — services are passed in at construction)
   - Write `buildGraph(services...)` function:
     - `.addNode()` for each node in the spec (use the exact node names from the spec)
     - `.addEdge()` for each edge in the spec flow
     - `.addConditionalEdges()` for any conditional routing
     - `.compile()` at the end
   - Write any routing functions (e.g., `routeAfterValidation`) in `usecase.ts`
   - Export `export const graph = buildGraph(serviceInstances...)` at module scope — compiled once

5. **Implement each `nodes/<name>.ts` file** (one file per node from the spec):
   - Factory function: `export function make<NodeName>Node(service?: Service) { return async (state: State): Promise<Partial<State>> => { ... }; }`
   - Pure nodes (no service dep): factory with no parameters
   - Only write the state keys this node is responsible for — return `Partial<State>`
   - Wrap service calls with `retry()` per the tech instruction files
   - Log errors and significant events with `logger`
   - For fire-and-forget terminal nodes: call async work with `.catch()`, return `{}` immediately

6. **Do NOT implement `trigger.ts`** — that is handled by SpecBuildExecutor. Only provide the exported `graph` instance that `trigger.ts` imports.

7. **Verify consistency:**
   - Every node name used in `.addEdge()` or `.addConditionalEdges()` must exist as a `.addNode()` entry
   - Every state field read by a node must be declared in `StateAnnotation`
   - Every state field written by a node must be in the node's return type (`Partial<State>`)

---

## Checklist

- [ ] All spec docs read before writing any code
- [ ] `Annotation.Root` state defined in `usecase.ts` with all fields from spec
- [ ] `type State = typeof StateAnnotation.State` exported
- [ ] `buildGraph()` uses exact node names from the spec
- [ ] All edges and conditional edges match the spec flow diagram
- [ ] `export const graph = buildGraph(...)` at module scope (cold-start)
- [ ] Each node is a factory function returning `async (state) => Partial<State>`
- [ ] Services injected via closure, not imported directly in node files
- [ ] Fire-and-forget nodes use `.catch()` and return `{}`
- [ ] `trigger.ts` NOT implemented (that is SpecBuildExecutor's responsibility)
