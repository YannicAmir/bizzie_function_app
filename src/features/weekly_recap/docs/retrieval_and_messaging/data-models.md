# Data Models

Types used within the retrieval & message pipeline. The `LLMResponse` type is defined in `storage/usecase.ts` and is read-only from this pipeline's perspective.

---

## Firestore Input Types

### `UserProfile` — read from `users/{uid}`

```typescript
interface UserProfile {
  uid: string;                       // document ID
  fcmTokens: Record<string, string>; // { [deviceId]: fcmToken }
  isSubscribed: boolean;
  notificationsEnabled: boolean;
  name: string;
}
```

Only users where `isSubscribed === true` AND `notificationsEnabled === true` are eligible for notifications.

### `users/{uid}` — Firestore document schema

| Field | Type | Description |
|---|---|---|
| `fcmTokens` | `map<string, string>` | Device ID → FCM token |
| `isSubscribed` | `boolean` | User has an active subscription |
| `notificationsEnabled` | `boolean` | User has enabled push notifications |
| `name` | `string` | Display name |

### `users/{uid}/watchlist/{ticker}` — Firestore document schema

Document IDs are ticker symbols (e.g. `"AAPL"`). Document content is not read — only the document IDs are needed to build the ticker list.

---

### `UserRecord` — assembled by `FirestoreService.retrieveSubscribedUsers()`

Combines the user profile with their watchlist. Passed to `RedisService.storeUsers()`.

```typescript
interface UserRecord {
  uid: string;
  fcmTokens: string[];   // values from UserProfile.fcmTokens map (device IDs discarded)
  tickers: string[];     // document IDs from users/{uid}/watchlist subcollection
}
```

---

### `WeeklySummary` — read from `weekly_recap/{ticker}/weeks/{weekEndDate}`

A subset of `LLMResponse` — only the fields needed for notification delivery.

```typescript
interface WeeklySummary {
  ticker: string;
  companyName: string;
  weekEndDate: string;          // document ID, e.g. "2026-05-16"
  messageTitle: string;         // ≤ 50 chars — APNS notification title
  messageShortSummary: string;  // ≤ 150 chars — APNS notification body
}
```

`messageLongSummary`, `confidenceScore`, link arrays, and `priceMovement` are not needed for delivery — the app reads the full document from Firestore when the user opens the notification.

---

## Redis Key Schema

### User claim key

| Key | Type | Value | TTL |
|---|---|---|---|
| `user:{uid}` | String (JSON) | `{ fcmTokens: string[] }` | 24 hours |
| `ticker:{ticker}` | Set | UIDs subscribed to this ticker | 24 hours |

TTL is set to 24 hours on every key at write time. Stale keys are cleaned up automatically even if the delivery window fails partway through.

---

## Pub/Sub Types

`WeeklySummary` is used directly as the Pub/Sub message payload — serialised as JSON, base64-encoded by the Pub/Sub SDK (same pattern as storage pipeline).

---

## FCM Types

### `FcmPayload`

```typescript
interface FcmPayload {
  notification: {
    title: string;   // messageTitle from WeeklySummary
    body: string;    // messageShortSummary from WeeklySummary
  };
  data: {
    type: 'weekly_summary';
    ticker: string;
  };
  topic: string;     // ticker symbol — used for APNS topic routing
}
```

### `EligibleUser` — returned by `RedisService.claimUsersForTicker()`

```typescript
interface EligibleUser {
  uid: string;
  fcmTokens: string[];
}
```
