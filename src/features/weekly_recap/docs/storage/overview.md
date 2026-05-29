# Weekly Recap — Storage Pipeline

## Purpose

Every Friday at 4pm EST this pipeline generates an AI-written market summary for every ticker on the global watchlist and persists it to Firestore. Those stored summaries are later consumed by the `retrieval_and_messaging` pipeline.

The pipeline is split into **two Cloud Functions** to avoid timeout limits and allow per-ticker parallelism via Pub/Sub:

1. **`weeklyRecapScheduler`** — reads every ticker from the global watchlist and publishes one Pub/Sub message per ticker.
2. **`weeklyRecapProcessor`** — handles one ticker per invocation: fetches FMP data, generates an LLM summary, validates and stores it.

---

## Triggers

| Function | Trigger | Schedule / Topic |
|---|---|---|
| `weeklyRecapScheduler` | Cloud Scheduler | `0 16 * * 5` — Fridays at 4pm EST (`America/New_York`) |
| `weeklyRecapProcessor` | Pub/Sub push | topic: `weekly-recap` |

---

## End-to-End Flow

```
Cloud Scheduler (Fri 4pm EST)
         │
         ▼
weeklyRecapScheduler  [trigger.ts]
  retrieveCompaniesFromDb()  ── [firestore_service.ts] reads Firestore: watchlist/{ticker}
  queueCompanies(companies)  ── [pubsub_service.ts]    publishes { ticker, companyName } per Company
         │
         │  (one invocation per ticker)
         ▼
weeklyRecapProcessor  [trigger.ts]
  retrieveCompanyFromQueue() ── [pubsub_service.ts]  → Company { ticker, companyName }
         │
         ▼  LangGraph graph (WeeklyRecapState)
  [calculateWeekWindow]      ── [usecase.ts]         → { startDate, endDate }
  [fetchMarketData]          ── [fmp_service.ts]     → news, filings, prices (Promise.allSettled)
  [calculateDeterministicFields]                     → counts, priceMovement
  [summarizeNews]            ── [ai_service.ts]      → llmPartial (ChatVertexAI + LangChainTracer + DeepEval observe)
  [validateSchema]           ── pure TypeScript      → valid? continue : END
  [assembleResponse]                                 → llmResponse
  [postProcessResponse]      ── [ai_service.ts]      → sanitized llmResponse
  [storeSummary]             ── [firestore_service.ts] → weekly_recap/{ticker}/weeks/{weekEndDate} → END
```

---

## Source Code Structure

```
src/features/weekly_recap/
└── storage/
    ├── trigger.ts                          # Cloud Function entry points (scheduler + processor)
    ├── usecase.ts                          # WeeklyRecapState, graph construction, compile, execute
    ├── constants/
    │   └── index.ts                        # Shared constants (TOPIC_NAME, FEATURE_NAME)
    ├── helpers/
    │   └── llm.ts                          # isValidLLMPartial, isRetryableLlmError, truncateToTokens, stripMarkdown
    ├── models/
    │   ├── index.ts                        # Barrel re-export
    │   ├── Company.ts
    │   ├── SummarizeNewsInput.ts
    │   ├── NewsArticle.ts
    │   ├── Filing8K.ts
    │   ├── StockPrice.ts
    │   ├── PriceMovement.ts
    │   └── LLMResponse.ts                  # includes CountFields
    ├── nodes/
    │   ├── calculateWeekWindow.ts
    │   ├── fetchMarketData.ts
    │   ├── calculateDeterministicFields.ts
    │   ├── summarizeNews.ts
    │   ├── validateSchema.ts
    │   ├── assembleResponse.ts
    │   ├── postProcessResponse.ts
    │   └── storeSummary.ts
    ├── prompts/
    │   └── storage_prompts.ts              # SUMMARIZE_NEWS_SYSTEM_PROMPT + SUMMARIZE_NEWS_USER_TEMPLATE
    └── services/
        ├── ai_service.ts
        ├── evaluation_service.ts
        ├── firestore_service.ts
        ├── fmp_service.ts
        └── pubsub_service.ts
```

---

## Docs Index

| Doc | Code file | Contents |
|---|---|---|
| [trigger.md](trigger.md) | `storage/trigger.ts` | Cloud Function configs and entry point logic |
| [usecase.md](usecase.md) | `storage/usecase.ts` | Orchestration steps |
| [data-models.md](data-models.md) | `storage/usecase.ts` | TypeScript interfaces + Firestore document schemas |
| [firestore-service.md](firestore-service.md) | `storage/services/firestore_service.ts` | Firestore reads/writes |
| [pubsub-service.md](pubsub-service.md) | `storage/services/pubsub_service.ts` | Pub/Sub publish and message deserialisation |
| [fmp-service.md](fmp-service.md) | `storage/services/fmp_service.ts` | FMP API calls |
| [ai-service.md](ai-service.md) | `storage/services/ai_service.ts` | LLM summarization and post-processing |
| [evaluation-service.md](evaluation-service.md) | `storage/services/evaluation_service.ts` | Confident AI / DeepEval tracing |
| [evaluation.md](evaluation.md) | — | LangSmith + Confident AI observability overview; platform metric collection setup |
| [langgraph.md](langgraph.md) | `storage/usecase.ts` + `storage/nodes/` | LangGraph state, node pattern, graph construction, conditional routing |
| [tech-stack.md](tech-stack.md) | — | Technologies, retry strategy, token budget, environment pattern |
| [logging.md](logging.md) | all files | Logging spec: what to log, where, and at what level |
| [dead-letter-setup.md](dead-letter-setup.md) | — | Step-by-step GCP console setup for the `weekly-recap-dead-letter` topic |
| [running-in-dev.md](running-in-dev.md) | — | How to manually trigger the pipeline in dev: shell vs deploy, command reference, what to look for in logs |
