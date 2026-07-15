# One-Time Setup — Firestore TTL Policy on `stock_news`

Firestore deletes documents automatically once a TTL policy names a timestamp field and that field's value passes. This must be configured **once per environment** (dev, qa, prod) before launch — without it, `expireAt` is inert and the collection grows unbounded.

[← back to overview](overview.md)

---

## Steps (per environment)

1. Select the environment's GCP project:
   ```bash
   gcloud config set project <dev|qa|prod project id>
   ```
2. Create the TTL policy on the `expireAt` field of the `stock_news` collection group:
   ```bash
   gcloud firestore fields ttls update expireAt \
     --collection-group=stock_news \
     --enable-ttl
   ```
3. Verify:
   ```bash
   gcloud firestore fields ttls list --collection-group=stock_news
   ```
   State must show `ACTIVE` (initial rollout can take a few minutes).

Console alternative: Firestore → *Time-to-live* tab → **Create policy** → collection group `stock_news`, timestamp field `expireAt`.

---

## Operational Notes

- **Deletion lag:** Firestore TTL typically deletes within 24 hours *after* `expireAt` — treat it as garbage collection, not an access control. Clients querying `stock_news` must filter `where('expireAt', '>', now)`.
- **Cost:** TTL deletes are billed as normal delete operations.
- **No index needed:** TTL fields do not require a composite index entry; the client query `symbol == X AND expireAt > now` will, however, need a composite index in `firestore.indexes.json` once the front end adds it.
- The pipeline never reads `expireAt`; it exists solely for the TTL policy and client filtering.
