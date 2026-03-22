# Tech Stack Rules & Environment

## 1. Project Identity
* **Project Name:** Bizzie Function App
* **IDE:** Antigravity (Google Internal/Cloud IDE)
* **Environments:**
    * `dev` (Bizzie Dev)
    * `qa` (Bizzie QA)
    * `prod` (Bizzie Prod)

## 2. Core Technologies
* **Runtime:** Node.js 20 (Target `es2020` or higher).
* **Language:** TypeScript 5.x (Strict mode enabled).
* **Platform:** Google Cloud Functions (2nd Gen).

## 3. Libraries & SDKs (The "Golden Path")
Use these specific packages. Do not introduce alternatives without approval.

| Category | Package Name | Usage Notes |
| :--- | :--- | :--- |
| **Framework** | `firebase-functions` | Use **v2** imports: `firebase-functions/v2/*` |
| **Admin SDK** | `firebase-admin` | For Firestore, Auth, and Remote Config access |
| **AI / LLM** | `@google-cloud/vertexai` | Direct access to Gemini 1.5 Flash/Pro |
| **Logging** | `firebase-functions/logger` | **MANDATORY**: Use `src/core/logger.ts` wrapper. No `console.log`. |
| **Validation** | `zod` | (Optional) For validating API inputs or JSON from AI |

## 4. Implementation Details

### A. Functions Generation 2
* ALWAYS explicitly set memory and timeout for AI functions.
* Example: `{ memory: '1GiB', timeoutSeconds: 540 }`.

### B. Vertex AI (Gemini)
* **Model:** `gemini-1.5-flash` (Default for speed/cost).
* **Output:** Use `responseMimeType: "application/json"` for all data generation tasks.
* **Location:** `us-central1` (Standard for Vertex AI).

### C. Environment Variables
* Access variables via `process.env`.
* **GCLOUD_PROJECT**: Provided automatically by the runtime.
* **PROJECT_ID**: Use for conditional logic between Dev/QA/Prod.

## 5. Development Workflow (TypeScript)
* **Package Manager:** `npm`
* **Build Command:** `npm run build` (Compiles TS to JS).
* **Linting:** `npm run lint` (ESLint).
* **Testing:** `npm test` (Jest).
* **Local Shell:** `npm run shell`

---

## 6. LangGraph Layer (Python)

Features that require multi-step AI orchestration include a **Python LangGraph service** alongside the TypeScript Cloud Function. This is a separate runtime (Cloud Run or LangGraph Platform) called via HTTP.

### Python Version
* **Python 3.11+** (3.12 preferred for new services)

### Core Packages (production — pin to exact versions in `requirements.txt`)

| Package | Purpose |
| :--- | :--- |
| `langgraph` | Graph framework |
| `langchain-core` | LangChain base |
| `langchain-google-vertexai` | Gemini / Vertex AI integration |
| `langgraph-checkpoint-postgres` | Durable production checkpointer |
| `langgraph-checkpoint-redis` | Alternative durable checkpointer |
| `fastapi` | HTTP serving (Cloud Run entry point) |
| `uvicorn[standard]` | ASGI server |
| `google-cloud-logging` | Structured logging to Cloud Logging |
| `pydantic` v2 | HTTP boundary validation only (not for state) |
| `python-dotenv` | Local env var loading |

### Dev-only Packages (`requirements-dev.txt`)

| Package | Purpose |
| :--- | :--- |
| `pytest` | Test runner |
| `pytest-asyncio` | Async test support |
| `ruff` | Linting + formatting (replaces black, flake8, isort) |
| `mypy` | Static type checking (`--strict`) |

### Development Workflow (Python)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

ruff check src/      # lint
ruff format src/     # format
mypy src/            # type check
pytest tests/ -v     # run tests
```

### Key Rules
* **State:** `TypedDict` only — never Pydantic `BaseModel` for graph state.
* **Async:** Always use `ainvoke` / `astream` in Cloud Run environments.
* **Checkpointer:** `MemorySaver` in local/tests; `PostgresSaver` or `RedisSaver` in production.
* **Logging:** `google-cloud-logging` v3 — `logging.getLogger(__name__)` per module; never print/console.
* **LLM:** `ChatVertexAI` from `langchain-google-vertexai`; model name from env/config — never hardcoded.

### Full Python Best Practices
See `.claude/instructions/langgraph-python.md` for project structure, state conventions, node patterns, error handling, testing, and deployment guidance.
