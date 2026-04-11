# LangGraph + Bizzie Function App — Architecture

Canonical reference for how LangGraph agent flows integrate with the Firebase Function App. Read this before implementing any LangGraph feature.

---

## Architecture Overview

LangGraph flows run in **Python** (Cloud Run or LangGraph Platform) and are called via **HTTP** from the Firebase Function App's `usecase.ts` layer. The function app stays TypeScript/Node 20; LangGraph provides the agent intelligence layer for features requiring multi-step reasoning, tool use, or stateful orchestration.

```mermaid
flowchart TD
    subgraph triggers["Triggers"]
        SCH[Cloud Scheduler]
        HTTP[HTTP / Webhook]
    end

    subgraph functionapp["Firebase Function App · TypeScript · Node 20"]
        direction TB
        TRG["trigger.ts\n― Presentation Layer ―\nCloud Function entry point\nParses input, catches top-level errors"]
        UC["usecase.ts\n― Domain Layer / Orchestrator ―\nBusiness logic\nDecides when to invoke LangGraph"]
        SVC["services/\n― Data Layer ―\nFirestore · Remote Config\nExternal APIs · Vertex AI"]
        DB[(Firestore /\nRemote Config)]
    end

    subgraph langgraph["LangGraph Agent Flow · Python · Cloud Run"]
        direction TB
        STATE["TypedDict State\n― Typed, minimal, immutable updates ―"]
        N1["Node: Input Validation\n& Guardrails"]
        N2["Node: LLM / Tool Call\n(Gemini · Vertex AI)"]
        ROUTER{Conditional Edge\nRouter}
        N3["Node: Output Formation\n& Validation"]
        CKPT[(Redis / Postgres\nCheckpointer)]
        OBS["LangSmith\nTracing & Observability"]
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
    ROUTER -->|"needs more steps\n(bounded by recursion_limit)"| N2
    ROUTER -->|"done"| N3
    N3 -->|"JSON response\n{result, metadata}"| UC

    STATE <-->|"durable\ncheckpointing"| CKPT
    STATE -.->|"traces"| OBS

    UC --> SVC
    SVC --> DB
```

---

## Integration Contract

| Concern | Detail |
|---|---|
| **Caller** | `usecase.ts` (TypeScript) — HTTP POST to the LangGraph service |
| **Callee** | Python LangGraph service (Cloud Run or LangGraph Platform) |
| **Auth** | Service-to-service via GCP IAM ID tokens or Secret Manager shared secret |
| **Request payload** | `{ input: {...}, thread_id: string, config?: {...} }` |
| **Response payload** | `{ output: {...}, run_id: string, metadata?: {...} }` |
| **Idempotency** | `thread_id` scoped per feature run; durable checkpointer ensures safe retries |
| **Timeout** | Cloud Function `timeoutSeconds` must exceed max graph execution time + 15s buffer |

---

## Per-Feature File Structure

```mermaid
flowchart LR
    subgraph feature["src/features/[feature_name]/"]
        TRG2[trigger.ts]
        UC2[usecase.ts]
        subgraph services["services/"]
            LS[langgraph_service.ts\nHTTP client]
            FS[firestore_service.ts]
        end
    end

    subgraph python["Python · LangGraph Service"]
        G[graph.py]
        subgraph nodes_pkg["nodes/"]
            N[node functions]
        end
        subgraph prompts_pkg["prompts/"]
            PR[prompt builders\nshared.py · *_prompts.py]
        end
        subgraph constants_pkg["constants/"]
            K[domain constants\nfmp_constants.py]
        end
        S[state.py]
        C[config.py]
    end

    TRG2 --> UC2
    UC2 --> LS
    UC2 --> FS
    LS -->|HTTP POST| G
    G --> nodes_pkg
    G --> S
    nodes_pkg --> prompts_pkg
    nodes_pkg --> constants_pkg
    nodes_pkg --> C
```

**Layer rules:**
- `trigger.ts` — unchanged; delegates to `usecase.ts` as always
- `usecase.ts` — calls `LangGraphService`, then passes result to downstream services (Firestore, etc.)
- `langgraph_service.ts` — thin HTTP client with retry (wraps `src/core/retry.ts`); URL from env/config; never hardcoded
- `langgraph/` directory — all graph logic lives here in Python; no graph code in TypeScript
- `nodes/` — async node functions only; no inline prompt strings, no domain constant sets
- `prompts/` — all LLM prompt strings and builders; `shared.py` holds cross-node utilities (`CONCISE_DIRECTIVE`, `PRICE_DISCLAIMER`, `_experience_instruction`, `_format_history`); one `*_prompts.py` per node that owns prompts
- `constants/` — domain configuration data (tool allowlists, denylists, thresholds); one `*_constants.py` per concern
- Every LangGraph implementation must satisfy `.claude/instructions/langgraph-enterprise-standards.md`

---

## Current Features & LangGraph Candidacy

| Feature | Current Implementation | LangGraph Potential |
|---|---|---|
| `sec_filing_analyzer` | Vertex AI direct call | **High** — multi-step: classify → extract → summarize → validate |
| `daily_brands` | AI generation + Remote Config | **Medium** — chain: prompt → generate → validate → publish |
| `watchlist_aggregator` | Data aggregation | **Medium** — map-reduce over watchlist items |
| `realtime_8k_notifier` | Real-time alert | **Medium** — classifier + router |
| `earnings_notifier` | Notification trigger | Low — simple chain |
| `bizzies_picks_notifier` | Notification | Low — simple chain |
| `subscription_drip` | Drip logic | Low — deterministic flow |

---

## Non-Negotiable Rules

- LangGraph **always** runs in Python — no `StateGraph` or graph code in TypeScript.
- `usecase.ts` knows only the HTTP contract — it never knows about nodes, state, or graph internals.
- `thread_id` must be scoped per feature run (e.g. `[feature]_[date]_[id]`) for idempotency.
- Cloud Function timeout must exceed max graph execution time + 15s.
- Every LangGraph feature requires a cost estimate (`.claude/docs/cost-estimates/`) and a review doc (`.claude/docs/reviews/`) before being considered complete.