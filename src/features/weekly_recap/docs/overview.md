# Weekly Recap

## Purpose
Generates and delivers a weekly AI-written summary for every ticker on the global watchlist. Each Friday at 4pm EST, the pipeline fetches the previous week's news articles, SEC 8-K filings, and end-of-day stock prices from the FMP API, summarises them with an LLM, validates the output, and persists the results to Firestore. A separate retrieval-and-message pipeline then reads those stored summaries and delivers them to users.

## Sub-features

| Sub-feature | Responsibility |
|---|---|
| [storage](storage/overview.md) | Scheduled ingestion, FMP data fetch, LLM summarisation, schema validation, Firestore persistence |
| [retrieval_and_message](retrieval_and_message/overview.md) | Query stored summaries, format messages, deliver to users |

## High-Level Architecture

```
Cloud Scheduler (Fri 4pm EST)
        │
        ▼
  [storage pipeline]   ──────▶   Firestore (LLM-generated news)
                                        │
                                        ▼
                            [retrieval_and_message pipeline]  ──▶  Users
```

## Shared Data Model — `LLMResponse`

Produced by the storage pipeline and persisted to Firestore:

| Field | Type | Description |
|---|---|---|
| `time` | string | ISO 8601 week-end date (the Friday) |
| `messageTitle` | string | LLM-generated headline, ≤ 80 chars |
| `messageShortSummary` | string | 2–3 sentence digest |
| `messageLongSummary` | string | Full paragraph summary |
| `confidenceScore` | number | LLM self-assessed confidence (0–1) |
| `ticker` | string | Stock ticker symbol |
| `companyName` | string | Full company name |
| `newArticleCount` | number | News articles ingested |
| `eightKCount` | number | 8-K filings ingested |
| `eodStockPriceCount` | number | EOD price data points ingested |
