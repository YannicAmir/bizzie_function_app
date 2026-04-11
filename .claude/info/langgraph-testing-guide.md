# LangGraph Testing Guide — Local & Post-Deploy

How to test LangGraph features at every stage of development, without needing the front end.

---

## Local Testing (before deploy)

### Step 1 — Start the Python graph (LangGraph Studio)

From the project root:
```bash
source .venv/bin/activate
langgraph dev
```

Opens a local server at `http://localhost:2024` with **LangGraph Studio** — a visual UI where you can:
- See the graph topology (nodes, edges, routing)
- Run the graph with any custom input
- Watch state change at each node in real time
- See traces appear in LangSmith (`bizzie_dev` project) simultaneously

Use this to test the **Python graph in isolation** before wiring the TypeScript layer.

---

### Step 2 — Start the TypeScript Cloud Functions (Firebase emulator)

In a second terminal:
```bash
firebase emulators:start --only functions
```

Exposes functions locally at:
```
http://localhost:5001/bizzie-dev-7199b/us-central1/[functionName]
```

For interactive shell (non-HTTP functions):
```bash
npm run shell
```

---

### Step 3 — Wire TypeScript → Python locally

The `langgraph_service.ts` reads the LangGraph URL from an env var. Set this in `.env` for local dev:
```
LANGGRAPH_URL=http://localhost:2024
```

In production this is a Cloud Run URL stored in GCP Secret Manager. Code never changes — only the env var.

---

### Step 4 — Test via Postman (replaces the front end)

For HTTP-triggered functions, call the emulator endpoint directly:
```
POST http://localhost:5001/bizzie-dev-7199b/us-central1/[functionName]
```

For Firestore-triggered functions, use the Firestore REST API — see `.agent/info/trigger-via-postman.md`.

Traces from the Python graph appear in LangSmith in real time as the request flows through.

---

### Local flow summary

```
Postman
    │  POST to localhost:5001
    ▼
Firebase emulator (TypeScript function)
    │  HTTP POST to localhost:2024
    ▼
langgraph dev (Python graph)
    │  traces
    ▼
LangSmith → bizzie_dev project (watch at smith.langchain.com)
```

---

## Post-Deploy Verification

### Step 1 — Get the deployed function URL

- **Cloud Function URL:** GCP Console → Cloud Functions → select function → copy trigger URL
- **Or:** Firebase Console → Functions → copy trigger URL

### Step 2 — Trigger via Postman

Hit the live URL exactly as you did locally. Same request shape — just a different URL.

For Firestore-triggered functions, use the Firestore REST API with a real GCP Bearer token:
```bash
gcloud auth print-access-token
```
See `.agent/info/trigger-via-postman.md` for the full Postman setup.

### Step 3 — Verify in LangSmith

smith.langchain.com → `bizzie_function_app` → select the project (`bizzie_dev` or `bizzie_prod`) → **Tracing**

Each run shows:
- Node-by-node execution trace
- Input/output at each node
- Token count and cost per run
- Latency per node
- Full error stack traces if something fails

### Step 4 — Check Cloud Run logs (if something breaks before LangSmith)

GCP Console → Cloud Run → `langgraph-[feature_name]` → **Logs**

Use this when the request never reaches LangSmith (e.g. container crash, auth failure, cold start issue).

---

### Post-deploy flow summary

```
Postman
    │  POST to Cloud Function URL
    ▼
Cloud Function (TypeScript, GCP)
    │  HTTP POST to Cloud Run URL
    ▼
Cloud Run (Python graph, GCP)
    │  traces
    ▼
LangSmith → bizzie_dev or bizzie_prod (verify at smith.langchain.com)
```

---

## Development Workflow (in order)

1. **Build graph** → test with `langgraph dev` + LangSmith (Python only, no TypeScript needed)
2. **Build TypeScript function** → test full stack via Postman + Firebase emulator
3. **Deploy** → re-run same Postman requests against live URLs, verify in LangSmith
4. **Front end wires up** → already know exactly what request shape works

> You never need the front end to test any of this. Postman IS the front end until it exists.

---

## Environment Variable Reference

| Variable | Local (`.env`) | GCP Secret Manager |
|---|---|---|
| `LANGGRAPH_URL` | `http://localhost:2024` | Cloud Run URL (per feature) |
| `LANGSMITH_API_KEY` | dev key | per-env key |
| `LANGSMITH_PROJECT` | `bizzie_dev` | `bizzie_dev` / `bizzie_qa` / `bizzie_prod` |
| `LANGSMITH_TRACING` | `true` | `true` |
| `LANGSMITH_ENDPOINT` | `https://api.smith.langchain.com` | `https://api.smith.langchain.com` |
