---
name: LangGraph Architecture
description: Canonical reference for integrating Python LangGraph agent flows with the TypeScript Firebase Function App.
---

# LangGraph Architecture: Bizzie Strategy

LangGraph flows run in **Python** (Cloud Run or LangGraph Platform) and are called via **HTTP** from the Firebase Function App's `usecase.ts` layer. The function app stays TypeScript; LangGraph provides the agent intelligence layer.

## System Diagram

```mermaid
flowchart TD
    subgraph triggers["Triggers"]
        SCH[Cloud Scheduler]
        HTTP[HTTP / Webhook]
    end

    subgraph functionapp["Firebase Function App · TypeScript · Node 20"]
        direction TB
        TRG["trigger.ts\n― Presentation Layer ―\nCloud Function entry point"]
        UC["usecase.ts\n― Domain Layer / Orchestrator ―\nBusiness logic"]
        SVC["services/\n― Data Layer ―\nFirestore · LangGraph Service"]
        DB[(Firestore)]
    end

    subgraph langgraph["LangGraph Agent Flow · Python · Cloud Run"]
        direction TB
        STATE["TypedDict State\n― Typed, minimal, immutable updates ―"]
        N1["Node: Validation"]
        N2["Node: LLM / Tool Call\n(Gemini · Vertex AI)"]
        ROUTER{Conditional Edge\nRouter}
        N3["Node: Output Formation"]
        CKPT[(Durable Checkpointer\nRedis / Postgres)]
    end

    SCH --> TRG
    HTTP --> TRG
    TRG --> UC
    UC --> SVC
    SVC <--> DB

    UC -->|"HTTP POST\n{payload, thread_id}"| STATE
    STATE --> N1
    N1 --> N2
    N2 --> ROUTER
    ROUTER -->|"needs more steps"| N2
    ROUTER -->|"done"| N3
    N3 -->|"JSON response"| UC
```

---

## Integration Contract

- **Caller**: `usecase.ts` (TypeScript) — HTTP POST to the LangGraph service.
- **Callee**: Python LangGraph service.
- **Payload**: `{ input: {...}, thread_id: string, config?: {...} }`.
- **Response**: `{ output: {...}, run_id: string, metadata?: {...} }`.
- **Idempotency**: `thread_id` must be scoped per feature run.
- **Timeout**: Cloud Function `timeoutSeconds` must exceed max graph execution time + 15s.

---

## Directory Structure

### TypeScript Feature Folder
`src/features/[feature_name]/`
- `trigger.ts`: Standard GCF entry point.
- `usecase.ts`: Orchestrator that calls the `LangGraphService`.
- `services/langgraph_service.ts`: HTTP client wrapping `src/core/retry.ts`.

### Python LangGraph Folder
`langgraph/[feature_name]/` (or standalone service)
- `graph.py`: StateGraph assembly and compilation.
- `nodes.py`: Node functions (async, partial updates).
- `state.py`: `TypedDict` for graph state.
- `config.py`: Environment-driven configuration.

---

## Non-Negotiable Rules

- LangGraph **always** runs in Python — no graph code in TypeScript.
- `usecase.ts` knows only the HTTP contract — never the graph's internal nodes or state.
- Durable checkpointing (Postgres/Redis) is mandatory for production.
- Every LangGraph feature requires a cost estimate before completion.
