# Local Dev: Running bizzie_chat for Postman Testing

Two terminals must be running simultaneously:
- **Terminal 1** — Python LangGraph agent (FastAPI/uvicorn on port 8080)
- **Terminal 2** — Firebase emulator (Cloud Function on port 5001)

---

## Terminal 1 — LangGraph Agent

```bash
cd /Users/yannicamir/developer/bizzie_function_app
source .venv/bin/activate
uvicorn src.features.bizzie_chat.agent.main:app --host 0.0.0.0 --port 8000 --reload
```

Agent is ready when you see:
```
INFO:     Application startup complete.
```

Health check: `GET http://localhost:8000/health` → `{"status": "ok"}`

---

## Terminal 2 — Firebase Emulator

```bash
cd /Users/yannicamir/developer/bizzie_function_app
firebase use dev
npm run serve
```

> `npm run serve` = `tsc` build + `firebase emulators:start --only functions`

Function is ready when you see:
```
✔  functions[us-central1-bizzieChat]: http function initialized (http://127.0.0.1:5001/...)
```

Emulator UI: `http://localhost:4000`

---

## Postman Setup

**URL:**
```
POST http://127.0.0.1:5001/bizzie-dev-7199b/us-central1/bizzieChat
```

**Headers:**
```
Authorization: Bearer <firebase-id-token>
Content-Type: application/json
```

**Body (non-stream):**
```json
{
  "idempotencyKey": "test-key-001",
  "query": "What is Apple's revenue?",
  "companyTicker": "AAPL",
  "companyName": "Apple Inc.",
  "sessionId": "3f7a2b1c-0000-0000-0000-000000000001"
}
```

**Body (stream):**
```json
{
  "idempotencyKey": "test-key-002",
  "query": "What is Apple's revenue?",
  "companyTicker": "AAPL",
  "companyName": "Apple Inc.",
  "sessionId": "3f7a2b1c-0000-0000-0000-000000000002",
  "stream": true
}
```

> **sessionId must be a valid UUID.** Generate a new one for each new conversation session.
> **idempotencyKey** must be unique per request (max 128 chars). Reusing a key within 24h returns the cached response.

---

## Getting a Firebase ID Token

In the Firebase emulator Auth UI (`http://localhost:4000/auth`), copy a user's UID, then run in the browser console or a script:

```js
// In a Firebase-connected JS context (or use the Admin SDK)
const token = await firebase.auth().currentUser.getIdToken(true);
console.log(token);
```

Or use the Firebase Admin SDK in a one-off script:
```bash
# Quick token via gcloud (points at dev project)
gcloud auth print-identity-token
```

> Note: emulator auth tokens are accepted by the emulator without hitting real Firebase Auth.

---

## Environment Notes

- The emulator reads secrets from `.secret.local` (root of repo) — `BIZZIE_CHAT_LANGGRAPH_URL` is already set to `http://localhost:8000`
- `ENV=local` in `.env.local` makes the Python agent use `MemorySaver` (in-memory checkpointer, no Redis required)
- Firestore writes go to the **dev** Firestore (real Firebase project) — visible in the Firebase console
- Rate limit and conversation history are stored in dev Firestore — reset by deleting docs in the console

---

## Teardown

Stop Terminal 1: `Ctrl+C`
Stop Terminal 2: `Ctrl+C`
