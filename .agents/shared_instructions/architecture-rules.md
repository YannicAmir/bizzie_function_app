---
name: Architecture Rules
description: Serverless Clean Architecture standards and directory structure for the Bizzie Function App.
---

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
    │   ├── [feature_name]/  # Example: "daily_brands"
    │   │   ├── trigger.ts   # PRESENTATION: The Cloud Scheduler/HTTP export
    │   │   ├── usecase.ts   # DOMAIN: The logic (e.g., "Get prompts, Call AI, Save Config")
    │   │   └── services/    # DATA: External interfaces
    │   │       ├── ai_service.ts       # Vertex AI implementation
    │   │       └── config_service.ts   # Remote Config implementation
    │   │
    │   └── [another_feature]/ # Example: "user_cleanup"
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

### D. Core Layer (src/core/)
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

## 5. LangGraph Agent Conventions

When a LangGraph agent's node file exceeds **300 lines**, it MUST be split into a `nodes/` sub-package.

### nodes/ Sub-Package Structure
```text
agent/
├── nodes/
│   ├── __init__.py          # Re-exports all public node functions (no logic)
│   ├── circuit_breaker.py   # Firestore CB helpers + CB check nodes
│   ├── guardian.py          # Classification + exit nodes
│   ├── ambassador.py        # Investment-advice path nodes
│   ├── fmp.py               # FMP research agent node
│   ├── tavily.py            # Tavily fallback + error nodes
│   └── assembler.py         # Sanitizer, follow-up, assembler nodes
├── graph.py
├── state.py
├── tools.py
└── config.py
```

## Rules
* **300-line soft limit** per file. Split when approaching this limit.
* **`__init__.py` re-exports all public symbols.** `graph.py` always imports from `nodes` (the package), never from a sub-module directly.
* **No cross-module node imports** (e.g., `fmp.py` may not import node functions from `ambassador.py`). Shared helpers (e.g., `_experience_instruction`, `_format_history`) are explicitly imported by the modules that need them.
* **Each sub-module must have a single clear responsibility** matching one logical pipeline stage.
* **Private helpers** (`_prefixed` functions) may be imported across sub-modules when genuinely shared.
