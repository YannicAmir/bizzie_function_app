# fmp_client.ts

The shared HTTP client the feature's FMP service delegates to. Every FMP call here is a single **windowed, single-symbol, bounded** GET, so the fetch/retry/timeout/validation machinery is factored here once and `fmp_eod_service.ts` becomes a one-line endpoint declaration. This mirrors [stock_price_sync/services/fmp_client.ts](../../../stock_price_sync/services/fmp_client.ts) — the duplication (rather than a shared `core/` client) is deliberate; see [design-decisions.md](design-decisions.md#feature-local-fmp-client-not-a-shared-core-client).

Imports: `retry` from `src/core/retry`, `AppError` from `src/core/errors`, `getRemoteConfig` from `src/core/remote-config`, `Logger` from `src/core/logger` (`new Logger('YtdPriceSync/FmpClient')`).

[← back to overview](overview.md)

---

## The endpoint abstraction

A service supplies a typed endpoint descriptor; the client owns the transport:

```typescript
interface FetchWindow { from: string; to: string; }              // "YYYY-MM-DD" (ET), inclusive
type FmpRowParser<T> = (item: unknown) => T | null;              // boundary validation; null = drop row

interface FmpEndpoint<T> {
  path: string;                 // '/historical-price-eod/light'
  label: string;                // used in error messages and the drop log ('EOD')
  fetchFailedCode: string;      // AppError code for a non-ok response
  invalidResponseCode: string;  // AppError code for a non-array body
  parseRow: FmpRowParser<T>;    // per-row parser/validator
}
```

## `fetchWindowedRows<T>(endpoint, ticker, window): Promise<T[]>`

1. Reads `getRemoteConfig().fmp.baseUrl` and builds `{baseUrl}{path}?symbol={enc(ticker)}&from={from}&to={to}&apikey=…`. `symbol` is a single ticker — no endpoint on the plan accepts multiple.
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
- `AppError` → retry only if `status ∈ {429, 500, 502, 503, 504}` (`TRANSIENT_STATUSES`). A `422` invalid-response (an FMP contract change) is **not** retried — it fails fast.
- `SyntaxError` (malformed JSON body) → **not** retried (same reasoning).
- Anything else (network errors, `AbortError` timeouts) → retried.

This is the single place the feature's FMP resilience is defined; the service carries none of it.
