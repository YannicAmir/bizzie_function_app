---
name: fcm apns best practice
description: Best practices for Firebase Cloud Messaging APNS delivery in Node.js TypeScript — sendEachForMulticast, APNS payload structure, stale token handling, and partial failure handling.
---

# Instructions for FCM / APNS in Cloud Functions

## 1. SDK and initialization

Use `firebase-admin` messaging. Initialize once at module scope:

```typescript
import { getMessaging, MulticastMessage, BatchResponse } from 'firebase-admin/messaging';
import { initializeApp, getApps } from 'firebase-admin/app';

if (!getApps().length) {
  initializeApp();
}

const messaging = getMessaging();
```

## 2. Use sendEachForMulticast for batched delivery

Always use `sendEachForMulticast` (not `sendMulticast` which is deprecated). It sends to up to 500 tokens per call and returns per-token results:

```typescript
const message: MulticastMessage = {
  tokens: fcmTokens, // string[], max 500 per call
  notification: {
    title: summary.title,
    body: summary.excerpt,
  },
  apns: {
    payload: {
      aps: {
        alert: {
          title: summary.title,
          body: summary.excerpt,
        },
        sound: 'default',
        badge: 1,
      },
    },
    headers: {
      'apns-priority': '10', // immediate delivery
    },
  },
  data: {
    ticker: summary.ticker,
    weekEndDate: summary.weekEndDate,
    type: 'weekly_recap',
  },
};

const response: BatchResponse = await retry(
  () => messaging.sendEachForMulticast(message),
  retryOptions,
);
```

## 3. Chunking — max 500 tokens per call

FCM limits `sendEachForMulticast` to 500 tokens. If you have more, chunk the array:

```typescript
const CHUNK_SIZE = 500;
for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
  const chunk = tokens.slice(i, i + CHUNK_SIZE);
  // send chunk
}
```

## 4. Partial failure handling — iterate responses

`sendEachForMulticast` does NOT throw on partial failure. You must iterate `response.responses`:

```typescript
response.responses.forEach((result, index) => {
  if (result.success) return;

  const errorCode = result.error?.code;

  if (errorCode === 'messaging/registration-token-not-registered' ||
      errorCode === 'messaging/invalid-registration-token') {
    // Stale / invalid token — log at warn, do NOT throw, do NOT retry
    logger.warn('FCM stale token', { token: tokens[index], errorCode });
    return;
  }

  // Other errors — log at error
  logger.error('FCM send failed', { token: tokens[index], errorCode, message: result.error?.message });
});
```

**Rule:** Never throw because of `UNREGISTERED` / stale tokens. Log at `warn` and continue.

## 5. APNS payload structure

For APNS (iOS) delivery, always set both `notification` (for background delivery) and `apns.payload.aps.alert` (for foreground display):

```typescript
apns: {
  payload: {
    aps: {
      alert: { title, body },   // required for foreground display
      sound: 'default',          // required for audible notification
      'content-available': 1,    // optional: for background refresh
    },
    // custom data beyond FCM data field (rarely needed)
  },
  headers: {
    'apns-priority': '10',      // 10 = immediate, 5 = power-efficient
    'apns-push-type': 'alert',  // required for iOS 13+
  },
}
```

## 6. Data payload

Put business data in the `data` field (string values only):

```typescript
data: {
  ticker: summary.ticker,          // stock ticker symbol
  weekEndDate: summary.weekEndDate, // ISO date string
  type: 'weekly_recap',            // discriminator for the app
},
```

Keep data payloads small (< 4KB total). Full summary content is NOT included — the app fetches it from Firestore on open.

## 7. Retry configuration

Wrap `sendEachForMulticast` in `retry()` from `src/core/retry.ts`:

```typescript
const retryOptions = {
  maxAttempts: 2,
  initialDelayMs: 1000,
  backoffFactor: 2,
  shouldRetry: (err: unknown) => {
    const code = (err as any)?.code as string | undefined;
    // Only retry transient errors — not UNREGISTERED/invalid tokens
    return !code?.includes('registration-token') && !code?.includes('invalid-argument');
  },
};
```

FCM retry config: `maxAttempts: 2`, `initialDelayMs: 1000`.

## 8. Logging

Log send outcomes with count context:

```typescript
logger.info('FCM batch sent', {
  ticker: summary.ticker,
  totalTokens: tokens.length,
  successCount: response.successCount,
  failureCount: response.failureCount,
});
```

## 9. Token cleanup

Stale token removal is out of scope for the delivery pipeline. When an `UNREGISTERED` token is detected:
1. Log at `warn` with the token (truncated for PII safety if needed)
2. Do NOT remove it in-band — token cleanup is a separate maintenance concern
3. Do NOT fail the delivery for other users because of one stale token

## 10. Anti-patterns to avoid

- Never use `send()` in a loop — always use `sendEachForMulticast` for batches
- Never throw on UNREGISTERED errors — it would fail the whole batch
- Never include sensitive user data in the FCM payload
- Never exceed 500 tokens per `sendEachForMulticast` call
- Never skip iterating `response.responses` — `failureCount > 0` does not throw

---

## Checklist

- [ ] `sendEachForMulticast` used (not deprecated `sendMulticast` or per-token `send` loop)
- [ ] Tokens chunked to max 500 per call
- [ ] `response.responses` iterated to handle per-token results
- [ ] `UNREGISTERED` / stale tokens logged at `warn`, not thrown
- [ ] APNS payload includes `aps.alert`, `aps.sound`, `apns-push-type` header
- [ ] `data` payload contains only string values, no large content
- [ ] `retry()` wraps send with `maxAttempts: 2`, transient-only `shouldRetry`
- [ ] Success/failure counts logged per batch
