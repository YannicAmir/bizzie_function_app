# Bizzie Chat — Frontend Integration Guide

This document is the authoritative reference for frontend agents (Flutter/Dart) implementing the Bizzie Chat feature. It covers the HTTP contract, how to generate required values, Firestore data shapes for reading chat history, and how streaming works.

---

## 1. HTTP Endpoint

**Method:** `POST`
**Function name:** `bizzieChat`
**Resolved URL per environment:** look up the Firebase Cloud Function URL from `lib/env/` (same pattern as other functions).

### Required Headers

```
Authorization: Bearer <Firebase ID Token>
Content-Type: application/json
```

Get the ID token from:
```dart
final token = await FirebaseAuth.instance.currentUser!.getIdToken();
```

This is a raw HTTP call (not a Firebase Callable Function), so use `http` or `dio` — **not** `FirebaseFunctions.httpsCallable`.

---

## 2. Request Body

```json
{
  "idempotencyKey": "string",
  "query": "string",
  "companyTicker": "string",
  "companyName": "string",
  "sessionId": "string (UUID v4)",
  "stream": true
}
```

| Field | Type | Max length | Notes |
|-------|------|------------|-------|
| `idempotencyKey` | string | 128 chars | Unique per send attempt — used to deduplicate retries |
| `query` | string | 500 chars | The user's message |
| `companyTicker` | string | 5 chars | Must match regex `^[A-Z]{1,5}$` e.g. `"AAPL"` |
| `companyName` | string | 100 chars | Full company name e.g. `"Apple Inc."` |
| `sessionId` | string (UUID v4) | — | Must be valid UUID v4 format |
| `stream` | boolean | — | Optional, defaults to `false` |

### How to Generate Required Values

**`sessionId`** — Generate once when the user starts a new chat session. Must be a valid UUID v4:
```dart
import 'package:uuid/uuid.dart';
final sessionId = const Uuid().v4();
```
The same `sessionId` is reused for every message in that conversation. The backend uses it as the Firestore document ID for the session, and as part of the LangGraph thread ID (`bizzie_chat_{sessionId}_{ticker}`).

**`idempotencyKey`** — Generate a fresh UUID v4 per message send attempt:
```dart
final idempotencyKey = const Uuid().v4();
```
If a network error occurs and you retry the same message, **reuse the same `idempotencyKey`**. The backend caches the response for 24 hours keyed by this value, so the user won't be charged twice against their rate limit and won't get a duplicate AI response.

**`companyTicker` / `companyName`** — These come from whichever stock/company the user is currently viewing. The ticker must be uppercase letters only, 1–5 chars. The company name is sanitized server-side but should be reasonable.

---

## 3. Non-Streaming Response (`stream: false`)

```json
{
  "message": "Full AI response text",
  "followUps": ["Follow-up question 1", "Follow-up question 2"],
  "source": "fmp" | "tavily" | null,
  "metadata": {
    "routePath": "ambassador" | "tavily" | "exit" | "price_redirect" | null,
    "sessionId": "the session UUID"
  }
}
```

**`followUps`** — Suggested follow-up questions. Display as tappable chips below the assistant response. Tapping one pre-fills the query input.

**`source`** — Which data source the AI used:
- `"fmp"` — Financial data from FMP API
- `"tavily"` — Web search fallback
- `null` — No external data used

**`routePath`** — Which agent path was taken. Two special values:
- `"exit"` — The user's message was a conversation-ender (e.g. "thanks, bye"). Handle gracefully.
- `"price_redirect"` — User asked a price-only question. Consider redirecting them to the stock price screen. **Neither `exit` nor `price_redirect` count against the user's daily rate limit.**

---

## 4. Streaming (`stream: true`)

The response is Server-Sent Events (SSE). The function sets:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

Each event is a line of the form:
```
data: <JSON>\n\n
```

### Event Types

**Token event** — incremental text chunk, append to the displayed message:
```json
{ "type": "token", "token": "Apple's revenue for Q3..." }
```

**Done event** — signals the complete response, includes follow-ups:
```json
{
  "type": "done",
  "follow_ups": ["What about margins?", "Compare to Microsoft?"],
  "source": "fmp",
  "route_path": "ambassador",
  "metadata": {}
}
```

**Error event** — something went wrong mid-stream:
```json
{ "type": "error", "message": "AI service unavailable" }
```

### Streaming Implementation Notes

- Accumulate all `token` events into a buffer — that buffer is the final `message` string.
- The `done` event arrives after all tokens. Use its `follow_ups`, `source`, `route_path` for display.
- On `error` event, show an error state. Do **not** persist an error turn to Firestore (the backend rolls back the rate limit automatically).
- Use `http` package with a streamed request, or `dio` with `ResponseType.stream`. Parse `data: ` prefixed lines, skip blank lines.
- Timeout: The backend has a 90-second timeout. Set your client timeout to at least 95 seconds.

### Recommended Parsing Pattern (Dart)

```dart
final request = http.Request('POST', uri);
request.headers['Authorization'] = 'Bearer $token';
request.headers['Content-Type'] = 'application/json';
request.body = jsonEncode(body);

final streamedResponse = await client.send(request);
final stream = streamedResponse.stream.transform(utf8.decoder);

final buffer = StringBuffer();
await for (final chunk in stream) {
  buffer.write(chunk);
  final text = buffer.toString();
  final lines = text.split('\n');
  buffer.clear();
  buffer.write(lines.last); // keep incomplete line

  for (final line in lines.sublist(0, lines.length - 1)) {
    if (!line.startsWith('data: ')) continue;
    final raw = line.substring(6).trim();
    if (raw.isEmpty) continue;
    final event = jsonDecode(raw) as Map<String, dynamic>;
    // handle event by event['type']
  }
}
```

---

## 5. Error Responses

| HTTP Status | Meaning | Frontend Action |
|-------------|---------|----------------|
| 400 | Invalid field (ticker format, empty query, injection detected, etc.) | Show input validation error |
| 401 | Auth token invalid or expired | Refresh token and retry, or force re-login |
| 403 | Not subscribed or subscription expired | Show paywall/subscription screen |
| 404 | User not found in Firestore | Should not happen for a logged-in user — log and show generic error |
| 429 | Daily rate limit reached | Show "You've reached your daily limit" message. Use `retryAfterSeconds` to tell the user when they can chat again |
| 503 | AI service temporarily unavailable | Show retry UI |

**429 response body:**
```json
{
  "error": "Daily chat limit reached",
  "retryAfterSeconds": 3600
}
```

---

## 6. Firestore Data — Reading Chat History

The backend writes all conversation data to Firestore automatically after each successful response. **The frontend only needs to read — never write — to these collections.**

### Collection Structure

```
users/{uid}/
  conversations/{sessionId}          ← session metadata document
    messages/{autoId}                ← individual messages subcollection
```

### Session Metadata Document (`users/{uid}/conversations/{sessionId}`)

```dart
class ChatSessionDoc {
  final String id;         // the sessionId (document ID)
  final String title;      // first 60 chars of the user's first message
  final String ticker;     // e.g. "AAPL"
  final String companyName;
  final Timestamp createdAt;
  final Timestamp updatedAt;
  final int messageCount;  // total messages (user + assistant combined)
}
```

### Message Document (`users/{uid}/conversations/{sessionId}/messages/{autoId}`)

```dart
class ChatMessageDoc {
  final String id;          // Firestore auto-generated doc ID
  final String role;        // "user" | "assistant"
  final String content;     // message text
  final Timestamp createdAt;
  // assistant-only fields (absent on user messages):
  final List<String>? followUps;
  final String? source;     // "fmp" | "tavily" | null
  final String? routePath;  // "ambassador" | "tavily" | "exit" | "price_redirect" | null
}
```

### Listing Sessions for a Ticker (Chat Tab View)

Sessions are always scoped to the current company ticker. When the user is on the NVDA chat tab, only NVDA sessions are shown. When they navigate to META, only META sessions are shown.

```dart
// Query sessions for the current ticker, most recent first
FirebaseFirestore.instance
  .collection('users')
  .doc(uid)
  .collection('conversations')
  .where('ticker', isEqualTo: companyTicker) // e.g. 'NVDA'
  .orderBy('updatedAt', descending: true)
  .snapshots(); // use snapshots() for real-time, get() for one-shot
```

This query requires the composite Firestore index on `(ticker ASC, updatedAt DESC)` — it is already defined in `firestore.indexes.json` and deployed with the backend.

Each document snapshot ID is the `sessionId`. Display `title`, `ticker`, `companyName`, `updatedAt`, and optionally `messageCount`.

### Viewing Messages in a Session

```dart
// Query all messages in a session, oldest first
FirebaseFirestore.instance
  .collection('users')
  .doc(uid)
  .collection('conversations')
  .doc(sessionId)
  .collection('messages')
  .orderBy('createdAt', descending: false)
  .snapshots();
```

Messages alternate `role: "user"` then `role: "assistant"`. The assistant message has the full `content`, `followUps`, `source`, and `routePath`.

### Important Notes on Firestore Reads

- **The session document is created on the first turn** (first user message). If you create a `sessionId` locally before sending, the Firestore document won't exist yet until the backend writes it.
- **Messages are written in a batch** — both the user and assistant messages are committed atomically. You will never see a user message without its corresponding assistant reply in Firestore (unless the backend errored).
- **Static route turns (`exit`, `price_redirect`) are NOT written to Firestore** and do NOT appear in message history. Handle these responses purely in-memory.
- The backend only loads the **last 6 messages** of a session as conversation context for the AI. There is no limit on how many messages you display — the full history is always in Firestore.
- Message `createdAt` timestamps: the user message and assistant message in the same turn have timestamps that are 1 millisecond apart (user is `now`, assistant is `now + 1ms`). They will always sort correctly.

---

## 7. Rate Limiting

- Default limit: **20 AI responses per 24 hours** per user (configurable via Firebase Remote Config).
- The limit uses a sliding 24-hour window — not a midnight reset.
- On a 429 response, use `retryAfterSeconds` to calculate and display an exact countdown.
- If the AI fails mid-response (error event in stream, or 503), the backend **automatically decrements** the counter so the user is not penalized.

---

## 8. Subscription Check

The backend validates subscription on every request. If the user's `isSubscribed` field is `false` in their Firestore user document (`users/{uid}`), or if their `subscriptionExpiryDate` has passed, the endpoint returns 403. The frontend should:
1. Listen to the user document stream for `isSubscribed` changes.
2. On 403, show the subscription/paywall screen.
3. Do not assume a locally-cached subscription state is accurate — always handle 403.

---

## 9. How the `companyTicker` and `companyName` Should Be Sourced

The chat is always in the context of a specific stock. These values should come from whatever company the user is currently viewing in the app (e.g. from the company profile page, watchlist tap, or search result). The ticker must already be in the `^[A-Z]{1,5}$` format — it is the raw stock symbol (no exchange suffix like `.O` or `:US`).

---

## 10. Summary of What the Backend Does (Invisible to Frontend)

For transparency — the frontend never needs to implement any of this, but it's helpful context:

1. Verifies Firebase auth token → gets `uid`
2. Checks idempotency cache → returns cached response if same key seen within 24h
3. Validates subscription status
4. Sanitizes query and company name
5. Checks prompt injection patterns
6. Increments rate limit counter
7. Loads last 6 messages of conversation history from Firestore
8. Sends to LangGraph agent (which routes through guardian → fmp/tavily → assembler)
9. Returns streamed tokens or full response
10. Writes both user and assistant messages to Firestore in a batch
11. Stores idempotency cache entry

The frontend only deals with steps 1 (providing the token) and 10 (reading the results from Firestore).
