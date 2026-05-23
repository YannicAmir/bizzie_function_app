# Architecture Rules: Serverless Clean Architecture

## 1. Core Philosophy
We follow a **Feature-First Clean Architecture**. Code is organized by **Feature** (what it does), not by **Layer** (what kind of file it is).

**Goal:** High cohesion (related code stays together), low coupling (features don't depend on each other), and testability.

## 2. Directory Structure (The Reference Tree)
The project MUST follow this directory structure. Agents should reference this tree when creating new files.

```text
bizzie-backend/
├── cloudbuild.yaml          # CI/CD Instructions (Dynamic for Dev/QA/Prod)
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript Config
├── .gitignore
├── docs/                    # Architecture docs, LangGraph standards, cost estimates, reviews
└── src/
    ├── index.ts             # MAIN EXPORT: Only exports functions, no logic here.
    │
    ├── core/                # SHARED Utilities (The "Kernel")
    │   ├── config.ts        # Environment configuration (Project IDs, etc.)
    │   ├── firebase.ts      # Singleton Firebase Admin setup
    │   ├── logger.ts        # Custom logging (structured for Cloud Logging)
    │   └── secrets.ts       # Helpers to fetch keys/secrets
    │
    ├── features/            # FEATURE MODULES
    │   │
    │   ├── [feature_name]/          # Standard GCF-only feature (e.g., "daily_brands")
    │   │   ├── trigger.ts           # PRESENTATION: Cloud Scheduler/HTTP export
    │   │   ├── usecase.ts           # DOMAIN: Orchestration and business logic
    │   │   └── services/            # DATA: External interfaces
    │   │       ├── ai_service.ts
    │   │       └── config_service.ts
    │   │
    │   ├── [feature_name]/          # LangGraph-enabled feature (e.g., "sec_filing_analyzer")
    │   │   ├── trigger.ts           # PRESENTATION: Cloud Function entry point (unchanged)
    │   │   ├── usecase.ts           # DOMAIN: Calls LangGraphService; orchestrates result
    │   │   ├── services/            # DATA: TypeScript service layer
    │   │   │   ├── langgraph_service.ts  # HTTP client to Python LangGraph service
    │   │   │   └── firestore_service.ts  # Other data services as needed
    │   │   └── langgraph/           # LANGGRAPH AGENT: Python service (separate runtime)
    │   │       ├── state.py         # TypedDict / Pydantic state definition
    │   │       ├── nodes.py         # Node functions (pure, async-safe)
    │   │       ├── graph.py         # StateGraph, edges, compile()
    │   │       ├── config.py        # Model IDs, limits, flags from env/remote config
    │   │       └── requirements.txt # Pinned Python dependencies
    │   │
    │   └── [another_feature]/
    │       ├── trigger.ts
    │       └── usecase.ts
    │
    └── tests/               # Unit and Integration Tests
        ├── setup.ts         # Test environment setup
        └── features/
            └── [feature_name]/
                └── usecase.test.ts
```

## 3. Layer Responsibilities

### A. Presentation Layer (trigger.ts)
* **Role:** The "Controller". It is the entry point for Google Cloud.
* **Responsibilities:**
    * Defines the trigger type (Schedule, onCall, onRequest).
    * Extracts parameters from the request/event.
    * **MUST NOT** contain business logic.
    * **MUST** call a Use Case to do the work.
    * Catches top-level errors and logs them.

### B. Domain Layer (usecase.ts)
* **Role:** The "Brain". Pure TypeScript logic.
* **Responsibilities:**
    * Orchestrates the flow of data.
    * Calls Services to get or save data.
    * **MUST NOT** depend on specific Google Cloud triggers (e.g., don't import `https` from `firebase-functions` here).
    * Should be testable without a real cloud environment.

### C. Data Layer (services/)
* **Role:** The "Worker".
* **Responsibilities:**
    * Interacts with the outside world (Vertex AI, Firestore, Remote Config, 3rd Party APIs).
    * Returns simple data structures (Interfaces/DTOs) to the Use Case.
    * Handles low-level API errors/retries.
    * For LangGraph features: `langgraph_service.ts` is a thin HTTP client that POSTs to the Python LangGraph service and returns a typed response. It wraps calls with `src/core/retry.ts`.

### D. LangGraph Layer (langgraph/)
* **Role:** The "Agent Brain" — present only in features that require multi-step AI orchestration.
* **Responsibilities:**
    * Implements the LangGraph `StateGraph` in Python (separate runtime: Cloud Run or LangGraph Platform).
    * Defines typed state (`state.py`), pure node functions (`nodes.py`), graph topology (`graph.py`), and config (`config.py`).
    * Exposes an HTTP endpoint consumed exclusively by `langgraph_service.ts` in the TypeScript layer.
    * **MUST NOT** contain any Firebase/TypeScript-specific logic — it is a standalone Python service.
    * All implementations must satisfy `.claude/instructions/langgraph-enterprise-standards.md`.
* **Key rule:** The GCF layer (`trigger.ts` → `usecase.ts` → `services/`) stays TypeScript. The agent logic lives entirely in Python. The boundary is the HTTP contract defined in `langgraph_service.ts`.

### E. Core Layer (src/core/)
* **Role:** The "Foundation".
* **Responsibilities:**
    * Singleton initializations (Firebase Admin, Vertex AI Client).
    * Shared utilities (Logger, Date formatters).
    * Environment Variable helpers.

## 4. Strict Constraints
* **No Cross-Feature Imports:** Feature A should not import code from Feature B. If logic is shared, move it to `src/core`.
* **No Logic in Index:** `src/index.ts` must only contain `export const funcName = ...` statements.
* **Environment Isolation:** Never hardcode Project IDs. Use `process.env` or `src/core/config.ts`.
* **Testing:** All `usecase.ts` files must have a corresponding test file in `src/tests/`.
* **Strict Typing:** ALL external API responses must be cast to a Raw DTO Interface first.
* **DTO Placement:** Private DTOs can be defined in the service file. Shared DTOs should go in `services/dtos.ts`.
* **Encapsulation:** DTOs should NOT be exported outside the `services/` directory.

## 5. LangGraph Features — Additional Constraints
* **No graph code in TypeScript:** All LangGraph `StateGraph` logic lives in Python under `langgraph/`. TypeScript only holds the HTTP client.
* **Single integration point:** `usecase.ts` calls only `LangGraphService`; it does not know about graph nodes, state, or Python internals.
* **Idempotency:** `langgraph_service.ts` must pass a `thread_id` scoped per feature run. The Python service must use a durable checkpointer (Redis or Postgres) — never `MemorySaver` in production.
* **Timeout alignment:** The Cloud Function timeout must exceed the maximum LangGraph graph execution time plus a safety buffer.
* **Output docs:** Every LangGraph feature must have a cost estimate `.claude/docs/cost-estimates/`) and a review doc (`.claude/docs/reviews/`) before being considered complete.
* **See also:** `.claude/instructions/langgraph-architecture.md` for the canonical integration diagram, and `.claude/instructions/langgraph.md` for the full enterprise standards checklist.
