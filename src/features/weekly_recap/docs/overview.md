# Weekly Recap

## Purpose

Generates and delivers a weekly AI-written market summary for every ticker on the global watchlist. Each Friday the feature runs in two sequential phases:

1. **Storage (4:00pm EST)** — fetches the previous week's news, press releases, SEC 8-K filings, and stock prices from FMP; generates an LLM summary per ticker via LangGraph; validates and persists results to Firestore.
2. **Retrieval & Messaging (4:30pm EST)** — reads stored summaries from Firestore, loads eligible users into Redis, and delivers one push notification per user via FCM/APNS. Redis enforces deduplication — a user subscribed to 10 tickers receives exactly 1 notification.

The 30-minute buffer is intentional: the storage pipeline must complete before the retrieval pipeline begins reading.

---

## Sub-features

| Sub-feature | Trigger | Responsibility |
|---|---|---|
| [storage](storage/overview.md) | Cloud Scheduler 4:00pm EST | FMP fetch · LangGraph LLM summarization · schema validation · Firestore write |
| [retrieval_and_messaging](retrieval_and_messaging/overview.md) | Cloud Scheduler 4:30pm EST | Redis deduplication · FCM/APNS delivery · per-user fan-out |

---

## End-to-End Timeline

```
Fri 4:00pm EST                              Fri 4:30pm EST
      │                                           │
      ▼                                           ▼
weeklyRecapScheduler                  weeklyRecapRetrievalScheduler
weeklyRecapProcessor ×N               weeklyRecapDeliveryProcessor ×N
      │                                           │
      ▼                                           ▼
Firestore                                  User Devices
weekly_recap/{ticker}/weeks/{date}         (APNS push via FCM)
```

---

## Shared Data Model — `LLMResponse`

Written by the storage pipeline to `weekly_recap/{ticker}/weeks/{weekEndDate}`. The retrieval & message pipeline reads a subset of these fields (`WeeklySummary`) to construct the push notification payload.

| Field | Type | Description |
|---|---|---|
| `time` | string | ISO 8601 datetime of summary generation |
| `ticker` | string | Stock ticker symbol |
| `companyName` | string | Full company name |
| `messageTitle` | string | LLM headline, ≤ 50 chars (APNS notification title) |
| `messageShortSummary` | string | 2–3 sentence digest, ≤ 150 chars (APNS notification body) |
| `messageLongSummary` | string | Full narrative summary |
| `confidenceScore` | number | LLM self-assessed confidence, integer 0–100 |
| `newArticleCount` | number | News articles ingested |
| `pressReleaseCount` | number | Press releases ingested |
| `eightKCount` | number | SEC 8-K filings ingested |
| `eodStockPriceCount` | number | End-of-day price data points ingested |
| `newsLinks` | string[] | Source URLs for news articles |
| `pressReleaseLinks` | string[] | Source URLs for press releases |
| `eightKLinks` | string[] | Source URLs for 8-K filings |
| `priceMovement` | PriceMovement | Start/end price, change, % change — deterministically calculated |
