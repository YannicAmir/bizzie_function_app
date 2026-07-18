# fmp_client.ts

The shared HTTP client both FMP services delegate to. Every FMP call in the feature is a single **windowed, single-symbol, bounded** GET, so the fetch/retry/timeout/validation machinery is factored here once and the per-endpoint services ([fmp_chart_service.ts](fmp-chart-service.md), [fmp_eod_service.ts](fmp-eod-service.md)) become one-line endpoint declarations.

Imports: `retry` from `src/core/retry`, `AppError` from `src/core/errors`, `getRemoteConfig` from `src/core/remote-config`, `Logger` from `src/core/logger` (`new Logger('StockPriceSync/FmpClient')`).

[← back to overview](overview.md)

---

## The endpoint abstraction

A service supplies a typed endpoint descriptor; the client owns the transport:

```typescript
interface FetchWindow { from: string; to: string; }              // "YYYY-MM-DD" (ET), inclusive
type FmpRowParser<T> = (item: unknown) => T | null;              // boundary validation; null = drop row

interface FmpEndpoint<T> {
  path: string;                 // e.g. '/historical-chart/1min'
  label: string;                // used in error messages and the drop log ('intraday' | 'EOD')
  fetchFailedCode: string;      // AppError code for a non-ok response
  invalidResponseCode: string;  // AppError code for a non-array body
  parseRow: FmpRowParser<T>;    // per-row parser/validator
}
```

## `fetchWindowedRows<T>(endpoint, ticker, window): Promise<T[]>`

1. Reads `getRemoteConfig().fmp.baseUrl` and builds the URL: `{baseUrl}{path}?symbol={enc(ticker)}&from={from}&to={to}&apikey=…`. `symbol` is a single ticker — no endpoint on the plan accepts multiple.
2. Wraps the request in `retry()` (config below). Each attempt `fetch`es with a **10s** `AbortSignal.timeout`.
3. Non-`response.ok` → throws `AppError("FMP {label} fetch failed for {ticker}: {statusText}", fetchFailedCode, response.status)`.
4. A non-array JSON body → throws `AppError("FMP {label} fetch returned a non-array response for {ticker}", invalidResponseCode, 422)`.
5. Maps rows through `endpoint.parseRow`, dropping any that return `null` and emitting **one info log per ticker** with the drop count. Returns the raw (unsorted) validated `T[]`.

## Retry & transient-error policy

```typescript
{ maxAttempts: 3, initialDelayMs: 1000, backoffFactor: 2, maxDelayMs: 30000, shouldRetry: isTransientError }
// delay series: 1s → 2s → throw
```

`isTransientError`:
- `AppError` → retry only if `status ∈ {429, 500, 502, 503, 504}` (`TRANSIENT_STATUSES`). A `422` invalid-response (an FMP contract change) is therefore **not** retried — it fails fast and surfaces.
- `SyntaxError` (malformed JSON body) → **not** retried (same reasoning: a contract change, not a blip).
- Anything else (network errors, `AbortError` timeouts) → retried.

This is the single place the whole feature's FMP resilience is defined; the services carry none of it.
