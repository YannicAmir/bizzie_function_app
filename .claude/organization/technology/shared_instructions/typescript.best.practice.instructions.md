---
name: TypeScript best practice
description: TypeScript-specific patterns for this project — strict mode, type safety, interfaces, generics, async/await, error typing, utility types, and DTO patterns.
---

# TypeScript Best Practices

## Compiler settings

Always assume `strict: true` is active. This enables:
- `strictNullChecks` — `undefined` and `null` are never assignable without explicit union
- `strictFunctionTypes` — contravariant function parameter checking
- `noImplicitAny` — every variable must have a type, explicit or inferred

Never use `// @ts-ignore` or `// @ts-nocheck`. Fix the underlying type issue instead.

---

## `interface` vs `type`

Use `interface` for object shapes that may be extended or implemented:

```typescript
interface UserRecord {
  uid: string;
  email: string;
  createdAt: FirebaseFirestore.Timestamp;
}
```

Use `type` for unions, intersections, mapped types, or aliases:

```typescript
type Status = 'pending' | 'complete' | 'failed';
type MaybeUser = UserRecord | null;
```

Never use `any`. Use `unknown` when the shape is truly unknown, then narrow before use.

---

## Null safety

Prefer explicit unions over optional chaining when a missing value is an error:

```typescript
// Wrong — silently swallows missing data
const name = user?.profile?.name;

// Right — fail loudly or handle the missing case explicitly
if (!user.profile) throw new Error('Profile missing');
const name = user.profile.name;
```

Use the non-null assertion operator (`!`) only when you have proof the value is defined (e.g., just checked with an `if`). Never use it as a shortcut to silence a compiler error.

---

## Async / await

Always `await` Promises. Never fire-and-forget without an explicit `.catch()`:

```typescript
// Wrong
someAsyncFn();

// Right — fire-and-forget with catch
someAsyncFn().catch((err) => logger.warn('non-critical failure', { error: err.message }));
```

Mark functions `async` only if they contain `await`. A function that returns `Promise.resolve(x)` synchronously does not need `async`.

Avoid mixing `.then()` chains with `await` in the same function.

---

## Error typing

Thrown values in TypeScript `catch` blocks have type `unknown`. Always narrow before accessing `.message`:

```typescript
catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error('something failed', { message });
}
```

Create typed error subclasses for domain errors; use `src/core/errors.ts` patterns:

```typescript
export class RecordNotFoundError extends Error {
  constructor(id: string) {
    super(`Record not found: ${id}`);
    this.name = 'RecordNotFoundError';
  }
}
```

---

## Generics

Use generics to avoid `any` when the shape varies but is known at the call site:

```typescript
async function getDocument<T>(ref: FirebaseFirestore.DocumentReference): Promise<T | null> {
  const snap = await ref.get();
  return snap.exists ? (snap.data() as T) : null;
}
```

Constrain generics with `extends` when you need to access specific properties:

```typescript
function getField<T extends { id: string }>(record: T): string {
  return record.id;
}
```

---

## Utility types

Use built-in utility types instead of redefining:

| Goal | Use |
|------|-----|
| All fields optional | `Partial<T>` |
| All fields required | `Required<T>` |
| All fields readonly | `Readonly<T>` |
| Subset of fields | `Pick<T, 'a' \| 'b'>` |
| Exclude fields | `Omit<T, 'sensitiveField'>` |
| Infer return type | `ReturnType<typeof fn>` |
| Infer parameter type | `Parameters<typeof fn>[0]` |

---

## DTO / external API patterns

Use `Readonly<T>` for objects received from external APIs to prevent accidental mutation:

```typescript
type FmpQuoteResponse = Readonly<{
  symbol: string;
  price: number;
  volume: number;
}>;
```

Validate at the boundary — don't trust external data shapes. Narrow with explicit checks or a validation library before passing into internal functions:

```typescript
function parseFmpQuote(raw: unknown): FmpQuoteResponse {
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid FMP quote response');
  const r = raw as Record<string, unknown>;
  if (typeof r.symbol !== 'string') throw new Error('Missing symbol');
  if (typeof r.price !== 'number') throw new Error('Missing price');
  if (typeof r.volume !== 'number') throw new Error('Missing volume');
  return { symbol: r.symbol, price: r.price, volume: r.volume };
}
```

---

## Enums

Prefer `const` object + `typeof` over `enum` for runtime-safe, tree-shakeable constants:

```typescript
// Prefer this
const Direction = { Up: 'up', Down: 'down' } as const;
type Direction = typeof Direction[keyof typeof Direction];

// Avoid this
enum Direction { Up = 'up', Down = 'down' }
```

---

## Module organization

- One exported class or set of related functions per file
- Export types alongside the implementation in the same file — no separate `types.ts` unless it is a shared data-models file
- Avoid barrel `index.ts` re-exports in feature directories — import from the exact file

---

## Forbidden patterns

- `any` — use `unknown` + narrowing instead
- `Function` type — type the signature explicitly
- `Object` / `object` type — use the exact shape
- `// @ts-ignore` — fix the type
- Mutable global state — use module-scoped singletons initialized once at cold-start
- `console.log` — use `src/core/logger.ts`
