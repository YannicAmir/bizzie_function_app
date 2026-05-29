---
name: Redis Service Builder Instructions
description: Step-by-step procedure for RedisServiceBuilder to implement services/redis_service.ts using ioredis with TLS, Secret Manager, atomic GETDEL, retry wrapping, and structured logging.
---

# Instructions for RedisServiceBuilder

## Role

Redis specialist. Receive a redis-service.md spec path and feature directory from SpecBuildExecutor. Read the spec and best practice instructions, then implement `services/redis_service.ts` following both exactly.

## Steps

1. Receive the redis-service.md spec path and feature directory from SpecBuildExecutor.

2. Read the `redis-service.md` spec doc in full. Note the exported interface: method names, parameter types, and return types.

3. Read `.claude/organization/technology/shared_instructions/redis.ioredis.best.practice.instructions.md` in full.

4. Read `src/core/retry.ts` to understand the retry utility signature and usage.

5. Read `src/core/logger.ts` to understand the logger instance and log levels.

6. Implement `services/redis_service.ts` in the feature directory with the following requirements:

   **Connection:**
   - Use `ioredis` as the Redis client library.
   - Load `REDIS_URL` and `REDIS_CA_CERT` from GCP Secret Manager at cold-start (not per-request).
   - Use `rediss://` scheme (TLS) and pass the CA cert via the `tls.ca` option.
   - Create the client once and reuse it across invocations.

   **Atomic operations:**
   - Use `GETDEL` for any claim-once or consume-once patterns — ensures a value is read and deleted atomically, preventing double-delivery.

   **Set operations:**
   - Use `SMEMBERS` to read set membership.
   - Use `SADD` to add to sets.
   - Use `EXPIRE` to set TTL on keys.

   **Retry:**
   - Wrap all Redis operations with `retry()` from `src/core/retry.ts`.

   **Error logging:**
   - Log all errors with `logger` at `error` level.
   - Include the key name and operation name in the log context.

   **Interface:**
   - Export a single class or set of functions that match the spec's interface exactly — same method names, same parameter types, same return types.

7. Verify the implemented interface matches the spec: compare each method name, each parameter type, and each return type against `redis-service.md`. Correct any mismatch before finishing.

---

## Checklist
- [ ] redis-service.md spec read in full
- [ ] redis.ioredis.best.practice.instructions.md read in full
- [ ] src/core/retry.ts read
- [ ] src/core/logger.ts read
- [ ] Connection uses ioredis with `rediss://` TLS scheme
- [ ] `REDIS_URL` and `REDIS_CA_CERT` loaded from Secret Manager at cold-start
- [ ] CA cert passed via `tls.ca` option
- [ ] `GETDEL` used for atomic claim/consume operations
- [ ] `SMEMBERS`, `SADD`, `EXPIRE` used where appropriate
- [ ] All Redis operations wrapped with `retry()`
- [ ] All errors logged at `error` level with key and operation context
- [ ] Exported interface matches spec: method names, parameter types, return types
