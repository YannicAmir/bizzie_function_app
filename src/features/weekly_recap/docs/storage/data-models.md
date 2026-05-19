# Data Models

Defined in `usecase.ts` and shared across all services.

---

## Input Types (FMP API → Use Case)

```typescript
interface NewsArticle {
  title: string;
  text: string;
  publishedDate: string;   // ISO 8601
  url: string;
}

interface PressRelease {
  title: string;
  text: string;
  publishedDate: string;   // ISO 8601
  url: string;
}

interface Filing8K {
  title: string;
  formType: string;        // always "8-K"
  filingDate: string;      // ISO 8601
  link: string;            // SEC index page
  finalLink: string;       // direct exhibit link
}

interface StockPrice {
  date: string;    // ISO 8601
  price: number;   // closing price for the day
  volume: number;
}

interface PriceMovement {
  startPrice: number | null;        // closing price on startDate; null if no data
  endPrice: number | null;          // closing price on endDate; null if no data
  priceChange: number | null;       // endPrice - startPrice, rounded to 2 dp
  priceChangePercent: number | null; // % change, rounded to 2 dp
}
```

---

## Output Type (LLM → Firestore)

```typescript
interface LLMResponse {
  time: string;                  // ISO 8601 datetime of when the summary was generated (e.g. "2026-05-15T16:00:00.000Z")
  messageTitle: string;          // LLM-generated headline, ≤ 50 characters (push notification title)
  messageShortSummary: string;   // 2–3 sentences, ≤ 150 characters (push notification body)
  messageLongSummary: string;    // Concise and catchy narrative; no hard limit
  confidenceScore: number;       // Integer 0–100, LLM self-assessed
  ticker: string;
  companyName: string;
  newArticleCount: number;       // length of NewsArticle[] fed to the LLM
  pressReleaseCount: number;     // length of PressRelease[] fed to the LLM
  eightKCount: number;           // stored as "8kCount" in Firestore (invalid JS identifier)
  eodStockPriceCount: number;    // length of StockPrice[] fed to the LLM
  newsLinks: string[];           // URLs from NewsArticle[], preserved for retrieval pipeline
  pressReleaseLinks: string[];   // URLs from PressRelease[], preserved for retrieval pipeline
  eightKLinks: string[];         // finalLink URLs from Filing8K[], preserved for retrieval pipeline
  priceMovement: PriceMovement;  // deterministically calculated by use case, passed to LLM as context
}
```

---

## Firestore Document Schemas

### `watchlist/{ticker}` — read by this pipeline

Read-only from this pipeline's perspective. Contains the set of tickers to generate weekly summaries for.

```
ticker:      string       // e.g. "AAPL"
companyName: string       // e.g. "Apple Inc."
lastAddedAt: Timestamp
```

### `weekly_recap/{ticker}/weeks/{weekEndDate}` — written by this pipeline

`{weekEndDate}` is the document ID — the date portion extracted from `response.time` (e.g. `"2026-05-15"`). Each week produces a new document in the `weeks` subcollection, preserving the full history of summaries per ticker. Re-running the same week overwrites only that week's document.

```
time:                string      // ISO 8601 datetime, e.g. "2026-05-15T16:00:00.000Z"
messageTitle:        string      // ≤ 50 chars
messageShortSummary: string      // 2–3 sentences, ≤ 150 chars
messageLongSummary:  string      // concise and catchy narrative
confidenceScore:     number      // integer 0–100
ticker:              string
companyName:         string
newArticleCount:     number
pressReleaseCount:   number
8kCount:             number      // note: stored as "8kCount" in Firestore; TypeScript uses eightKCount
eodStockPriceCount:  number
newsLinks:           string[]
pressReleaseLinks:   string[]
eightKLinks:         string[]
priceMovement:       map         // { startPrice, endPrice, priceChange, priceChangePercent } — nullable fields
createdAt:           Timestamp   // server-side, added by FirestoreService before writing
```
