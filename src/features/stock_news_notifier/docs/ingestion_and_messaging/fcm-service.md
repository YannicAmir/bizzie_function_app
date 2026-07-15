# fcm_service.ts

Sends one coalesced news notification per ticker to the FCM topic named after the ticker — the same topic convention `realtime_8k_notifier` already uses (`sendTopicNotification(filing.symbol, ...)`), so clients need no new subscription logic: subscribing a device to a ticker's watchlist topic covers both features.

This is a feature-local service (not the core `FcmNotificationService`) because it needs an APNS collapse id, which the core `sendTopicNotification` does not support. It follows the house FCM rules in `.claude/organization/technology/shared_instructions/fcm.apns.best.practice.instructions.md`.

Imports: `getFirebaseAdmin` from `src/core/firebase`, `Logger` from `src/core/logger`.

[← back to overview](overview.md)

---

## Functions

### `sendNewsNotification(input: NewsNotificationInput): Promise<void>`

```typescript
interface NewsNotificationInput {
  ticker: string;             // FCM topic
  title: string;              // "{ticker} News" or "{ticker}: {N} new stories"
  body: string;               // newest article title, truncated to 178 chars;
                              // when count > 1, suffixed with "... and more"
                              // (title truncated so body ≤ 178 chars incl. suffix)
  newsId: string;             // newest article's doc ID — client deep-link
  url: string;                // newest article URL
  count: number;              // articles coalesced into this notification
}
```

Message shape:

```typescript
{
  topic: ticker,
  notification: { title, body },
  apns: {
    headers: {
      'apns-priority': '10',
      'apns-collapse-id': `news_${ticker}`,   // rapid successive sends replace, not stack
    },
    payload: { aps: { sound: 'default' } },
  },
  android: { collapseKey: `news_${ticker}` },
  data: {
    type: 'stock_news',
    ticker,
    newsId,
    url,
    count: String(count),     // FCM data values must be strings
  },
}
```

Sent with `getFirebaseAdmin().messaging().send(message)`. **Errors are logged and swallowed, never thrown** — matches the core `NotificationService` convention; a failed push must not block cursor advancement or other tickers. No FCM-level retry: the cooldown claim was already consumed, and a delayed duplicate push is worse than a missed one for minute-cadence news.

Sending to a topic with zero subscribers is a silent no-op on FCM's side — no server-side check needed for tickers that left all watchlists between the Firestore read and the send.
