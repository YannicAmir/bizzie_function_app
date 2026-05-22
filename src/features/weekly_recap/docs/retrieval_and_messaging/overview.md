# Weekly Recap — Retrieval & Messaging Pipeline

## Purpose

Every Friday at 4:30pm EST this pipeline reads the LLM-generated weekly summaries produced by the storage pipeline and delivers one push notification per user via Apple Push Notification Service (APNS) through Firebase Cloud Messaging (FCM). A user subscribed to 10 tickers receives exactly 1 notification — Redis enforces this deduplication guarantee.

The pipeline is split into **two Cloud Functions** to allow per-ticker fan-out via Pub/Sub:

1. **`weeklyRecapRetrievalScheduler`** — loads all eligible users into Redis, reads this week's summaries from Firestore, and publishes one Pub/Sub message per ticker.
2. **`weeklyRecapDeliveryProcessor`** — handles one ticker per invocation: claims eligible users from Redis and sends FCM notifications.

---

## Triggers

| Function | Trigger | Schedule / Topic |
|---|---|---|
| `weeklyRecapRetrievalScheduler` | Cloud Scheduler | `30 16 * * 5` — Fridays at 4:30pm EST (`America/New_York`) |
| `weeklyRecapDeliveryProcessor` | Pub/Sub push | topic: `weekly-recap-delivery` |

---

## End-to-End Flow

```
Cloud Scheduler (Fri 4:30pm EST)
         │
         ▼
weeklyRecapRetrievalScheduler  [trigger.ts]
  FirestoreService.retrieveSubscribedUsers()  ── reads users/{uid} + users/{uid}/watchlist
  RedisService.storeUsers(users)              ── writes user:{uid} keys + ticker:{ticker} sets (TTL 24h)
         │  (must complete before step 3)
  FirestoreService.retrieveSummariesForWeek() ── reads weekly_recap/{ticker}/weeks/{weekEndDate}
  PubSubService.queueSummaries(summaries)     ── publishes one WeeklySummary per ticker
         │
         │  (one invocation per ticker)
         ▼
weeklyRecapDeliveryProcessor  [trigger.ts]
  PubSubService.retrieveSummaryFromQueue()    ── deserialise Pub/Sub message → WeeklySummary
  RedisService.claimUsersForTicker(ticker)    ── SMEMBERS + GETDEL (atomic claim)
         │  (if no eligible users: log info, return)
  FcmService.sendNotifications(users, summary) ── FCM APNS batched push (sendEachForMulticast)
```

---

## Source Code Structure

```
src/features/weekly_recap/
└── retrieval_and_messaging/
    ├── trigger.ts
    ├── usecase.ts
    └── services/
        ├── firestore_service.ts
        ├── redis_service.ts
        ├── pubsub_service.ts
        └── fcm_service.ts
```

---

## Upstream Dependency

This pipeline depends on the storage pipeline having completed and written `weekly_recap/{ticker}/weeks/{weekEndDate}` documents to Firestore before 4:30pm EST on Friday. The storage pipeline runs at 4:00pm EST — there is a 30-minute buffer. Tickers with no Firestore document are skipped with a `warn` log.

---

## Collections Read

| Collection | Access | Description |
|---|---|---|
| `users/{uid}` | read | User profile — `fcmTokens`, `isSubscribed`, `notificationsEnabled` |
| `users/{uid}/watchlist/{ticker}` | read | Per-user ticker subscriptions; document IDs are ticker symbols |
| `weekly_recap/{ticker}/weeks/{weekEndDate}` | read | LLM summaries written by the storage pipeline |

---

## Docs Index

| Doc | Code file | Contents |
|---|---|---|
| [trigger.md](trigger.md) | `retrieval_and_messaging/trigger.ts` | Cloud Function configs and entry point logic |
| [usecase.md](usecase.md) | `retrieval_and_messaging/usecase.ts` | Orchestration — RetrievalSchedulerUsecase and DeliveryProcessorUsecase |
| [data-models.md](data-models.md) | `retrieval_and_messaging/` shared | TypeScript interfaces and Redis/Pub/Sub schemas |
| [firestore-service.md](firestore-service.md) | `retrieval_and_messaging/services/firestore_service.ts` | Firestore reads |
| [redis-service.md](redis-service.md) | `retrieval_and_messaging/services/redis_service.ts` | Redis claim store — deduplication |
| [pubsub-service.md](pubsub-service.md) | `retrieval_and_messaging/services/pubsub_service.ts` | Pub/Sub publish and message deserialisation |
| [fcm-service.md](fcm-service.md) | `retrieval_and_messaging/services/fcm_service.ts` | FCM APNS notification delivery |
| [tech-stack.md](tech-stack.md) | — | Technologies, retry strategy, environment pattern |
| [logging.md](logging.md) | all files | Logging spec: what to log, where, and at what level |
