# One-Time Setup — Firestore TTL Policy on `general_market_news`

Firestore deletes documents automatically once a TTL policy names a timestamp field and that field's value passes. This must be configured **once per environment** (dev, qa, prod) before launch — without it, `expireAt` is inert and the collection grows unbounded.

[← back to overview](overview.md)

---

## Steps (per environment)

1. Select the environment's GCP project:
   ```bash
   gcloud config set project <dev|qa|prod project id>
   ```
2. Create the TTL policy on the `expireAt` field of the `general_market_news` collection group:
   ```bash
   gcloud firestore fields ttls update expireAt \
     --collection-group=general_market_news \
     --enable-ttl
   ```
3. Verify:
   ```bash
   gcloud firestore fields ttls list --collection-group=general_market_news
   ```
   State must show `ACTIVE` (initial rollout can take a few minutes).

Console alternative: Firestore → *Time-to-live* tab → **Create policy** → collection group `general_market_news`, timestamp field `expireAt`.

---

## Operational Notes

- **Deletion lag:** Firestore TTL typically deletes within 24 hours *after* `expireAt` — treat it as garbage collection, not an access control. Clients filtering `publishedAt >= now − 2d` naturally exclude TTL-lagged documents.
- **Cost:** TTL deletes are billed as normal delete operations.
- **No index needed for TTL itself:** TTL fields require no composite index entry.
- Nothing reads `expireAt`; it exists solely for the TTL policy.
