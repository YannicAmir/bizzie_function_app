# firestore_service.ts

Owns the single write path to the `ytd_price_change` collection. Mirrors [stock_price_sync/services/firestore_service.ts](../../../stock_price_sync/services/firestore_service.ts).

Imports: `getFirebaseAdmin` from `src/core/firebase`, `Logger` from `src/core/logger`, `FieldValue` from `firebase-admin/firestore`, `YTD_PRICE_CHANGE_COLLECTION` from `../constants`.

[← back to overview](overview.md)

---

## `upsertYtd(snapshot: YtdChangeSnapshot): Promise<void>`

| Aspect | Behaviour |
|---|---|
| Target | `ytd_price_change/{snapshot.ticker}` |
| Operation | `ref.set(payload)` — **full-document overwrite** (not `{ merge: true }`); every field is recomputed each run, so wholesale replacement is what makes the write idempotent |
| `updatedAt` | Stamped here as `FieldValue.serverTimestamp()` — never set by the use case |
| Guard | Throws if `snapshot.ticker` is falsy (`upsertYtd: snapshot.ticker is required`) |
| On error | Logs `Failed to upsert YTD change for {ticker}` and **rethrows** — the use case counts it `failed`; the next scheduled fire recomputes and retries (writes are never retried in-process) |

```typescript
type YtdWrite = Omit<StoredYtdChange, 'updatedAt'> & { updatedAt: FieldValue };
```

This service does not read Firestore — the watchlist read is the shared core `FirebaseWatchlistService`, and the price fetch is [fmp_eod_service.ts](fmp-eod-service.md).
