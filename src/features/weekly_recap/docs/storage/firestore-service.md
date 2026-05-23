# services/firestore_service.ts

All Firestore reads and writes for the storage pipeline. No business logic — pure data access.

Uses `getFirebaseAdmin().firestore()` from `src/core/firebase.ts`. Logger instantiated as `new Logger('WeeklyRecap/Storage/FirestoreService')` from `src/core/logger.ts`. `Company` is imported from `../models` — not defined here.

---

## Collections

| Collection | Access | Description |
|---|---|---|
| `watchlist/{ticker}` | read | Global watchlist of tickers to process |
| `weekly_recap/{ticker}/weeks/{weekEndDate}` | write | Historical LLM summaries per ticker, consumed by `retrieval_and_messaging` |

---

## Functions

### `retrieveCompaniesFromDb(): Promise<Company[]>`

Called by `weeklyRecapScheduler` before publishing to Pub/Sub.

- Fetches all documents from the `watchlist` collection.
- Returns an array of `Company` (`{ ticker, companyName }`) for every document.
- Returns an empty array (no throw) if the collection is empty — scheduler logs a warning and exits cleanly.

---

### `storeSummaryInDb(response: LLMResponse): Promise<void>`

Called by `WeeklyRecapStorageUseCase` after validation and post-processing.

- Writes to `weekly_recap/{ticker}/weeks/{weekEndDate}` where `{weekEndDate}` is the document ID derived by extracting the date portion from `response.time` (e.g. `"2026-05-15T16:00:00.000Z"` → `"2026-05-15"`). This keeps document IDs human-readable and ensures one document per week regardless of the exact run time.
- Merges `createdAt: FieldValue.serverTimestamp()` into the payload before writing.
- Uses `set()` without `merge` — each `weekEndDate` is a distinct document, preserving historical summaries. Re-running the same week overwrites only that week's document.
- Throws on Firestore error (caught and logged by the use case).
