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

## Constants

| Constant | Value | Purpose |
|---|---|---|
| `FMP_PAGE` | `0` | First-page offset sent on all paginated requests |
| `FMP_NEWS_LIMIT` | `30` | Max items returned by `getNews` and `getPressReleases` |
| `FMP_FILINGS_LIMIT` | `20` | Max items returned by `get8Ks` (before client-side filtering) |

---

## Raw DTOs

Internal types that represent the shape of raw FMP API array items before they are mapped to domain models. Defined as `Readonly<{...}>` with `unknown` field types — fields are narrowed to strings/numbers during mapping.

| Type | Used by |
|---|---|
| `FmpArticleRaw` | `getNews`, `getPressReleases` |
| `FmpFilingRaw` | `get8Ks` |
| `FmpPriceRaw` | `getEodStockPrice` |

---

## Retry Config

All FMP calls share a single config object `FMP_RETRY_OPTIONS`:

```typescript
const FMP_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffFactor: 2,        // delay series: 1s → 2s → throw
  maxDelayMs: 30000,
  shouldRetry: isTransientError,
};
```

HTTP errors thrown by `fetchJson` are typed as `AppError` (from `src/core/errors.ts`) with `code: 'FMP_FETCH_FAILED'` and `status` set to the HTTP response status code. `isTransientError` checks `err instanceof AppError` first and inspects `err.status` directly — no unsafe casts. Network-level errors (not `AppError` instances) are matched by message string.

Transient (retried): HTTP 429, 500, 503, network timeouts.
Permanent (not retried): HTTP 400, 401, 403, 404.

Per-attempt retry logs and exhaustion errors are emitted via the `onRetry` callback and a `catch` block inside `fetchJson` — see [Logging](#logging).

---

## Private Helpers

### `getBaseUrl(): Promise<string>`

Resolves `fmp.baseUrl` from Remote Config. Called once per public method invocation to avoid duplicating the `getRemoteConfig()` + field extraction in every method.

### `fetchJson(url, type, ticker): Promise<unknown[]>`

Executes a single FMP HTTP request inside the retry wrapper. Shared by all four public methods.

- Throws `new AppError(message, 'FMP_FETCH_FAILED', response.status)` if `response.ok` is false.
- Passes `FMP_RETRY_OPTIONS` plus an `onRetry` callback that logs each retry attempt.
- Catches exhaustion errors, logs them at `error` level, then re-throws.
- Returns `[]` if the response is not an array (defensive against unexpected FMP shapes).

---

## Public Methods

### `getNews(ticker, startDate, endDate): Promise<NewsArticle[]>`

```
GET {baseUrl}/news/stock?symbols={ticker}&from={startDate}&to={endDate}&page=0&limit=30&apikey={key}
```

Returns up to `FMP_NEWS_LIMIT` news articles for the ticker within the date window. Maps `FmpArticleRaw` fields (`publishedDate`, `title`, `text`, `url`) to `NewsArticle`.

---

### `getPressReleases(ticker, startDate, endDate): Promise<PressRelease[]>`

```
GET {baseUrl}/news/press-releases?symbols={ticker}&from={startDate}&to={endDate}&page=0&limit=30&apikey={key}
```

Returns up to `FMP_NEWS_LIMIT` press releases for the ticker within the date window. Maps `FmpArticleRaw` fields to `PressRelease`.

---

### `get8Ks(ticker, startDate, endDate): Promise<Filing8K[]>`

```
GET {baseUrl}/sec-filings-search/symbol?symbol={ticker}&from={startDate}&to={endDate}&page=0&limit=20&apikey={key}
```

Fetches up to `FMP_FILINGS_LIMIT` SEC filings for the ticker in the date window, then filters client-side to `formType === '8-K'`. Maps matching `FmpFilingRaw` records (`filingDate`, `formType`, `link`, `finalLink`) to `Filing8K`.

---

### `getEodStockPrice(ticker, startDate, endDate): Promise<StockPrice[]>`

```
GET {baseUrl}/historical-price-eod/light?symbol={ticker}&from={startDate}&to={endDate}&apikey={key}
```

Returns one `StockPrice` entry per trading day in the window. Response is a flat array — no nested unwrapping needed. Maps `FmpPriceRaw` fields (`date`, `price`, `volume`) directly to `StockPrice`. Maximum 5000 records per request.
