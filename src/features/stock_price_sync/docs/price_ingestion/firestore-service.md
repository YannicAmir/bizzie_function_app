# firestore_service.ts

Single-purpose Firestore writer for the pipeline. No transactions, no state documents — the feature deliberately has no server-side state beyond the snapshot documents themselves (see [design-decisions.md](design-decisions.md)).

Imports: `getFirebaseAdmin` from `src/core/firebase`, `Logger` from `src/core/logger` (`new Logger('Stock Price Firestore Service')`). Collection name `STOCK_PRICES_COLLECTION = 'stock_prices'` from `constants/index.ts`.

[← back to overview](overview.md)

---

## Functions

### `upsertPrice(snapshot: PriceSnapshot): Promise<void>`

- Guards `snapshot.ticker` (the doc ID) — an empty ticker throws `Error('upsertPrice: snapshot.ticker is required')` before any write, since a blank doc ID would silently mis-key the write.
- Builds a typed `StockPriceWrite` (`Omit<StoredStockPrice, 'updatedAt'> & { updatedAt: FieldValue }`) — the compiler enforces the payload matches the document shape, with `updatedAt` as a `FieldValue` sentinel.
- Writes `stock_prices/{snapshot.ticker}` with `set()` — a **full overwrite**, never `merge`. The document is a pure projection of the latest FMP fetch; merging could leave stale fields behind after a shape change and would break the idempotency argument.
- Appends `updatedAt: FieldValue.serverTimestamp()`.
- On failure, logs (`Failed to upsert price for {ticker}`) and rethrows — per-ticker error isolation lives in the use case's `writeSnapshot`, which catches and counts it. No retry here: the next run's full rewrite is the retry.

No delete path: the global watchlist is append-only (accepted in `stock_news_notifier`'s resolved decisions), so documents are never orphaned in practice. If watchlist pruning is ever introduced, a cleanup pass belongs to that feature, not this pipeline.
