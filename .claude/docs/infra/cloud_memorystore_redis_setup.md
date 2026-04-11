# Cloud Memorystore Redis — Setup Guide for bizzie_chat

## Why Redis Is Needed

LangGraph uses a **checkpointer** to save graph progress after each node completes. Without a durable checkpointer:
- If a network error causes the GCF → Cloud Run call to timeout and retry, the graph restarts from scratch — wasting tokens and time.
- There is no way to resume a partially-completed graph run.

With Redis as the checkpointer (`AsyncRedisSaver`):
- Each node's output is written to Redis immediately after it completes.
- A retry resumes from the last completed node — not the beginning.
- Session state is available for 24h (default Redis key TTL).

Think of Redis as a save-game checkpoint system: you checkpoint after each level, so if the game crashes you don't start over from level 1.

---

## Option A: GCP Cloud Memorystore (recommended for production)

### Step 1 — Provision the instance

```bash
gcloud redis instances create bizzie-chat-checkpointer \
  --size=1 \
  --region=us-central1 \
  --redis-version=redis_7_0 \
  --network=default \
  --tier=BASIC
```

- `--size=1` — 1 GB capacity (sufficient for hundreds of concurrent sessions)
- `--tier=BASIC` — no replication; acceptable for a checkpointer (data loss on failure triggers graph restart, not data corruption)
- `--network=default` — must match the VPC your Cloud Run services use

### Step 2 — Get the IP address

```bash
gcloud redis instances describe bizzie-chat-checkpointer \
  --region=us-central1 \
  --format='value(host)'
```

Copy the output IP address (e.g. `10.0.0.3`).

### Step 3 — Store the connection string in Secret Manager

```bash
echo -n "redis://10.0.0.3:6379" | gcloud secrets create REDIS_URL \
  --data-file=- \
  --replication-policy="automatic"
```

If the secret already exists, add a new version:

```bash
echo -n "redis://10.0.0.3:6379" | gcloud secrets versions add REDIS_URL --data-file=-
```

### Step 4 — VPC access for Cloud Run

Cloud Memorystore is only accessible from within the same VPC. Cloud Run must be configured to route traffic through your VPC:

```bash
gcloud run services update langgraph-bizzie_chat \
  --region=us-central1 \
  --vpc-connector=YOUR_VPC_CONNECTOR \
  --vpc-egress=private-ranges-only
```

If you don't have a VPC connector yet:

```bash
gcloud compute networks vpc-access connectors create bizzie-connector \
  --region=us-central1 \
  --subnet=default \
  --min-instances=2 \
  --max-instances=3
```

### Step 5 — Test the connection

From a GCE instance or Cloud Shell in the same VPC:

```bash
redis-cli -h 10.0.0.3 PING
# Expected output: PONG
```

### Cost

A 1 GB Basic tier Memorystore instance in `us-central1` is approximately **$49/month**.

---

## Option B: Upstash Redis (cheaper for low-volume or development)

Upstash provides a serverless Redis with pay-per-request pricing — ideal for dev/QA environments or low-volume production use.

1. Create an account at [upstash.com](https://upstash.com)
2. Create a Redis database (choose `us-central1` region for lowest latency)
3. Copy the **Redis URL** from the dashboard (format: `redis://default:<password>@<host>:<port>`)
4. Store it in Secret Manager:

```bash
echo -n "redis://default:PASSWORD@HOST:PORT" | gcloud secrets versions add REDIS_URL --data-file=-
```

No VPC connector required — Upstash is accessed over the public internet (TLS).

**Cost:** ~$0.2 per 100,000 commands. At 20 requests/user/day with ~15 node checkpoints each = ~300 Redis writes/user/day. Very low cost at typical Bizzie scale.

---

## Fallback Behavior

If Redis is unavailable at startup, `graph.py` logs a warning and falls back to `MemorySaver` (in-memory, non-durable). The graph still runs — it just won't resume on retry. This is logged at `WARNING` level and visible in Cloud Logging.

```
WARNING: Redis checkpointer init failed — falling back to MemorySaver
```

---

## Key Reference

| Config key | Value |
|---|---|
| Instance name | `bizzie-chat-checkpointer` |
| Region | `us-central1` |
| Secret Manager key | `REDIS_URL` |
| Default port | `6379` |
| Connection string format | `redis://<ip>:<port>` |
