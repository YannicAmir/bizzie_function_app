# Tech Stack & Retry Strategy

[← back to overview](overview.md)

---

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20, TypeScript 5.x (strict mode) |
| Cloud Functions | Google Cloud Functions 2nd Gen (`firebase-functions/v2/scheduler`) |
| Scheduling | Google Cloud Scheduler — `* 4-23 * * *` (every minute, 4:00am–11:59pm EST) |
| Database | Google Cloud Firestore (+ TTL policy on `stock_news.expireAt`) |
| Market data | FMP REST API — `stable/news/stock-latest` |
| Push | FCM topic messaging (topic = ticker) with APNS collapse id |
| Secrets | GCP Secret Manager — `FMP_API_KEY` via `defineSecret` |
| Retry / backoff | `src/core/retry.ts` |
| Logging | `src/core/logger.ts` |
| Config | `src/core/remote-config.ts` — new `stock_news` block (below) |

No LLM, no Pub/Sub, no Redis — the per-minute cadence and small per-run workload fit a single function.

---

## Remote Config — new key `stock_news_config`

Created with the **JSON data type** in the Firebase console (unlike the legacy string-typed `fmp_config`) so malformed values are rejected at save time. The Admin SDK still returns the value as a string in `getTemplate()`, so `src/core/remote-config.ts` parses it with `JSON.parse` exactly like `fmp_config`, into `AppConfig.stock_news`:

```typescript
stock_news: {
  pageLimit: number;                    // default 250   — items per FMP page
  maxPages: number;                     // default 4     — latest-feed pages before backfill kicks in
  maxBackfillPages: number;             // default 10    — ranged-fetch safety cap
  overlapWindowSeconds: number;         // default 300   — re-read window behind the cursor
  notificationCooldownSeconds: number;  // default 600   — min gap between pushes per ticker
  watchlistCacheSeconds: number;        // default 300   — per-instance watchlist cache TTL
}
```

Every tuning knob is runtime-adjustable without a deploy. Defaults live in `DEFAULT_CONFIG`. There is deliberately no `enabled` flag — pausing the Cloud Scheduler job in the GCP console is the kill switch (see [trigger.md](trigger.md)).

---

## Retry Strategy

| Call site | maxAttempts | initialDelayMs | backoffFactor | Delay series |
|---|---|---|---|---|
| FMP page fetch (`fmp_news_service.ts`) | 3 | 1000ms | 2 | 1s → 2s → throw |
| Watchlist fetch (core service) | 3 | 1000ms | 2 | 1s → 2s → throw |

**Transient (retried):** HTTP 429/5xx, network failures. **Permanent (not retried):** run-level — a failed run simply doesn't advance the cursor; the next minute's run is the retry. Firestore transactions rely on the SDK's built-in retry; FCM sends are never retried (see [fcm-service.md](fcm-service.md)).

**Per-item isolation:** article writes and per-ticker notifications are individually caught — see the failure table in [usecase.md](usecase.md).

---

## Cost Envelope (defaults, ~500 watched tickers)

| Resource | Volume |
|---|---|
| FMP calls | ~1,200/day (1–2 pages/min typical; no runs 12:00–3:59am EST) |
| Firestore reads | watchlist ~500 × 240/day (5-min cache) + state doc reads |
| Firestore writes | matched articles (~200–2,000/day) + cursor/lease (~3,600/day) + cooldown claims |
| Function invocations | 1,200/day × ~2–10s runtime @ 256MiB |

---

## Resolved Decisions

| Decision | Resolution |
|---|---|
| FMP `publishedDate` timezone | Confirmed US/Eastern — `overlapCutoff` math parses/formats in `America/New_York`. |
| FMP rate limit / schedule window | Plan accommodates the volume. Scheduler additionally skips 12:00–3:59am EST (`* 4-23 * * *`), ~1,200 runs/day. Overnight articles are not lost: the 4:00am run finds the cursor ~4h behind and catches up via deeper pages or the ranged backfill, delivering them as coalesced notifications (see [trigger.md](trigger.md)). |
| Premium gating | None — all users receive news notifications; topic messaging stands. |
| Append-only global watchlist | Accepted for now — no prune. Revisit if storage/FCM cost for unwatched tickers becomes material. |
| Per-ticker cooldown | 10 minutes (`notificationCooldownSeconds: 600`). Plain suppression, no digest — articles arriving inside the cooldown are stored for the feed but never notified. Runtime-tunable via Remote Config if 10 min proves too chatty or too quiet. |

## Open Questions / TODOs

| # | Question |
|---|---|
| 1 | Confirm the front end subscribes devices to the raw-ticker topic on watchlist add and resubscribes on FCM token rotation (`onTokenRefresh`). |
| 2 | TTL policy must be created per environment (dev/qa/prod) before launch — [ttl-setup.md](ttl-setup.md). |
