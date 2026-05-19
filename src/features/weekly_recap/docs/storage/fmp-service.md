# services/fmp_service.ts

Wraps all Financial Modeling Prep (FMP) REST API calls. Every method applies exponential backoff via `src/core/retry.ts`. Logger instantiated as `new Logger('WeeklyRecap/Storage/FmpService')` from `src/core/logger.ts`.

---

## Base URLs

Resolved at runtime via `getRemoteConfig()` from `src/core/remote-config.ts` — accessed as `config.fmp.baseUrl`, `config.fmp.v3Url`, `config.fmp.v4Url`.

| Key | Default URL | Used by |
|---|---|---|
| `fmp.baseUrl` | `https://financialmodelingprep.com/stable` | `getNews`, `getPressReleases`, `get8Ks`, `getEodStockPrice` |
| `fmp.v3Url` | `https://financialmodelingprep.com/api/v3` | (reserved) |
| `fmp.v4Url` | `https://financialmodelingprep.com/api/v4` | (reserved) |

API key: `config.fmpApiKey` from env var `FMP_API_KEY` (`src/core/config.ts`).

---

## Retry Config (all FMP calls)

```typescript
retry(fn, {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffFactor: 2,        // delay series: 1s → 2s → throw
  maxDelayMs: 30000,
  shouldRetry: (err) => isTransientError(err),
})
```

Transient (retried): HTTP 429, 500, 503, network timeouts.
Permanent (not retried): HTTP 400, 401, 403, 404.

---

## Functions

### `getNews(ticker, startDate, endDate): Promise<NewsArticle[]>`

```
GET {baseUrl}/news/stock?symbols={ticker}&from={startDate}&to={endDate}&page=0&limit=30&apikey={key}
```

Returns up to 30 news articles for the ticker within the date window. Maps raw FMP fields (`symbol`, `publishedDate`, `title`, `text`, `url`) to `NewsArticle`.

---

### `getPressReleases(ticker, startDate, endDate): Promise<PressRelease[]>`

```
GET {baseUrl}/news/press-releases?symbols={ticker}&from={startDate}&to={endDate}&page=0&limit=30&apikey={key}
```

Returns up to 30 press releases for the ticker within the date window. Maps raw FMP fields (`symbol`, `publishedDate`, `title`, `text`, `url`) to `PressRelease`.

---

### `get8Ks(ticker, startDate, endDate): Promise<Filing8K[]>`

```
GET {baseUrl}/sec-filings-search/symbol?symbol={ticker}&from={startDate}&to={endDate}&page=0&limit=20&apikey={key}
```

Fetches all SEC filings for the ticker in the date window, then filters client-side to `formType === '8-K'`. Maps matching records (`symbol`, `filingDate`, `formType`, `link`, `finalLink`) to `Filing8K`.

---

### `getEodStockPrice(ticker, startDate, endDate): Promise<StockPrice[]>`

```
GET {baseUrl}/historical-price-eod/light?symbol={ticker}&from={startDate}&to={endDate}&apikey={key}
```

Returns one `StockPrice` entry per trading day in the window. Response is a flat array — no nested unwrapping needed. Maps `date`, `price`, and `volume` directly to `StockPrice`. Maximum 5000 records per request.
