---
name: pubsub gcp best practice
description: Best practices for Google Cloud Pub/Sub in Node.js TypeScript Cloud Functions — publishing, push subscriptions, message serialization, dead-letter topics, and error handling.
---

# Instructions for Google Cloud Pub/Sub in Cloud Functions

## 1. SDK and client

Use `@google-cloud/pubsub`. Create ONE `PubSub` client at module scope:

```typescript
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub();
```

The client automatically uses Application Default Credentials in Cloud Functions — no explicit auth setup needed.

## 2. Publishing messages

Always serialize the payload to a `Buffer` with UTF-8 encoding:

```typescript
import { retry } from '../../../../core/retry';

async function publishMessage<T>(topicName: string, payload: T): Promise<void> {
  const data = Buffer.from(JSON.stringify(payload), 'utf-8');
  const topic = pubsub.topic(topicName);

  await retry(
    () => topic.publishMessage({ data }),
    {
      maxAttempts: 3,
      initialDelayMs: 1000,
      backoffFactor: 2,
      shouldRetry: isTransientPubSubError,
    },
  );
}
```

- Always pass `'utf-8'` explicitly to `Buffer.from()`
- Keep message payloads < 10 MB (hard limit), target < 100 KB in practice
- Store large content in Firestore and publish only an identifier

## 3. Message attributes

Use the `attributes` field for routing metadata only (string values, not business data):

```typescript
await topic.publishMessage({
  data,
  attributes: {
    schemaVersion: '1',
    featureId: 'weekly_recap',
  },
});
```

Business payload belongs in `data`. Attributes are for filtering and routing.

## 4. Push subscription trigger in Cloud Functions 2nd Gen

Use `onMessagePublished` from `firebase-functions/v2/pubsub`:

```typescript
import { onMessagePublished } from 'firebase-functions/v2/pubsub';

export const weeklyRecapProcessor = onMessagePublished(
  {
    topic: 'weekly-recap',
    retry: true,         // enable automatic retry on non-200 response
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (event) => {
    const payload = deserializeMessage<MyPayloadType>(event.data.message.data);
    // process...
  },
);
```

- Always set `retry: true` so Pub/Sub retries on function failure
- The function MUST return/complete without throwing to acknowledge the message
- Throwing causes a retry — only throw for genuinely transient errors

## 5. Message deserialization

The `message.data` field is base64-encoded. Decode and parse safely:

```typescript
function deserializeMessage<T>(data: string): T {
  try {
    const json = Buffer.from(data, 'base64').toString('utf-8');
    return JSON.parse(json) as T;
  } catch (err) {
    // Malformed message — log and acknowledge (return without throw)
    // Throwing here would cause infinite retries
    logger.error('Failed to deserialize Pub/Sub message', { data, error: (err as Error).message });
    throw err; // only rethrow if you want DLQ routing after maxDeliveryAttempts
  }
}
```

**Critical:** A malformed message that cannot be parsed should NOT cause infinite retries. After `maxDeliveryAttempts` it routes to the dead-letter topic automatically.

## 6. Dead-letter topics

Configure dead-letter topics in GCP console / Terraform for every subscription:
- Dead-letter topic name convention: `{original-topic}-dead-letter`
- `maxDeliveryAttempts: 5` — after 5 failures, message routes to DLT
- Grant the Pub/Sub service account `pubsub.publisher` role on the dead-letter topic
- Monitor the dead-letter subscription — unprocessed DLT messages indicate persistent failures

## 7. Transient vs permanent errors

```typescript
function isTransientPubSubError(err: unknown): boolean {
  const grpcCode = (err as any)?.code;
  // Transient: UNAVAILABLE (14), INTERNAL (13), DEADLINE_EXCEEDED (4), RESOURCE_EXHAUSTED (8)
  return [4, 8, 13, 14].includes(grpcCode);
  // Permanent (don't retry): NOT_FOUND (5), PERMISSION_DENIED (7), INVALID_ARGUMENT (3)
}
```

## 8. Ordering keys

Do NOT use ordering keys for independent parallel jobs (scheduler → per-ticker processors). Ordering keys serialize delivery, destroying the parallelism benefit. Only use them when sequential per-entity ordering is strictly required.

## 9. Batching / flow control

Default publisher settings (1000 messages / 10ms batch) are appropriate for scheduler patterns publishing < 500 messages. Only configure `flowControlOptions` if publishing > 1000 messages per invocation.

## 10. Logging

Log publish and receive events:

```typescript
// Publisher side
logger.info('Published Pub/Sub messages', { topic: topicName, count: payloads.length });

// Processor side
logger.info('Processing Pub/Sub message', { ticker: payload.ticker, messageId: event.data.message.messageId });
```

---

## Checklist

- [ ] Single `PubSub` client at module scope, not per invocation
- [ ] Payload serialized with `Buffer.from(JSON.stringify(payload), 'utf-8')`
- [ ] `retry()` wraps publish calls with transient-only `shouldRetry`
- [ ] Push trigger uses `onMessagePublished` with `retry: true`
- [ ] Deserialization wraps `Buffer.from(data, 'base64').toString('utf-8')` + `JSON.parse` in try/catch
- [ ] Dead-letter topic configured for every subscription
- [ ] Ordering keys not used for parallel fan-out patterns
- [ ] Publish and receive events logged with count/messageId context
