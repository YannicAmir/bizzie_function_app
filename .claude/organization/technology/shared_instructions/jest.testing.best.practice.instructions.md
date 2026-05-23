---
name: jest testing best practices
description: Project-specific Jest testing stack rules and patterns for the Bizzie Function App TypeScript codebase.
---

# Jest Testing Stack

## Versions & Tools

| Tool | Version | Purpose |
| :--- | :--- | :--- |
| `jest` | ^30.x | Test runner |
| `ts-jest` | ^29.x | TypeScript transformer |
| `@types/jest` | ^30.x | Type definitions |
| `firebase-functions-test` | ^3.x | Firebase Functions test helpers |

Run with: `npm test`  
Run specific suite: `npm test src/tests/features/<feature_name>/`  
Lint after tests: `npm run lint`

---

## Test File Location

| Source file | Test file location |
| :--- | :--- |
| `src/features/<feature>/usecase.ts` | `src/tests/features/<feature>/usecase.test.ts` |
| `src/features/<feature>/services/<svc>.ts` | `src/tests/features/<feature>/services/<svc>.test.ts` |
| `src/core/<util>.ts` | `src/tests/core/<util>.test.ts` |

---

## Required Structure: Arrange-Act-Assert

Every `it()` block MUST use the AAA pattern. Comments `// Arrange`, `// Act`, `// Assert` are **required** — they are not optional.

```typescript
it('entityUnderTest_actionOrScenario_expectedResult', async () => {
    // Arrange
    const input = ...;

    // Act
    const result = await subject.method(input);

    // Assert
    expect(result).toBe(...);
});
```

Global setup (mocks, instances) goes inside `beforeEach()` with an `// Arrange` comment.  
Do NOT place `// Arrange` inside `beforeEach` if the data is test-specific — keep it in the `it()` block instead.

---

## Naming Conventions

**Format:** `lowerCamelCase` only — no spaces, no `should`, no `it should`.

```
entityUnderTest_actionOrScenario_expectedResult
given_when_then
```

**Examples:**
- `signInWithEmail_success_returnsUser`
- `dailyBrandsTrigger_invalidRequest_throwsError`
- `streamRecentFreeUsers_emptyResult_yieldsNothing`
- `execute_validUser_sendsToAllTokens`

---

## Mocking Strategy

### Logger (always mock)
```typescript
jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
    }))
}));
```

### Retry (mock when testing services that call it)
```typescript
jest.mock('../../core/retry', () => ({
    retry: jest.fn((fn) => fn())
}));
```

### Domain Layer (UseCase) — inject mocked services
```typescript
let mockService: jest.Mocked<MyService>;

beforeEach(() => {
    // Arrange
    mockService = {
        methodName: jest.fn()
    } as jest.Mocked<MyService>;

    useCase = new MyUseCase(mockService);
});
```

### Data Layer (Service) — inject a mocked Firestore/SDK client
```typescript
let mockDb: any; // eslint-disable-line @typescript-eslint/no-explicit-any

beforeEach(() => {
    // Arrange
    mockDb = {
        collection: jest.fn().mockReturnValue(mockCollection)
    };
    service = new MyFirebaseService(mockDb);
});
```

**Rules:**
- Mock external I/O (Firestore, PubSub, HTTP clients, Remote Config) at the boundary.
- Do NOT mock `src/core` utilities unless absolutely necessary (retry is an exception when services call it internally).
- Do NOT mock AI/LLM services — those tests belong to LangSmith / DeepEval / Confident AI.

---

## Async Patterns

Use `async/await` for all async tests. For async generators:

```typescript
const generator = service.streamData(7);
const result = await generator.next();
expect(result.done).toBe(false);
```

For fake timers:
```typescript
beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2023-10-10T12:00:00Z'));
});
afterEach(() => {
    jest.useRealTimers();
});
```

---

## Coverage Requirements

Every feature scenario requires **both**:
- A **success** test case
- A **failure / edge-case** test case

Do not ship tests with only the happy path covered.

---

## What NOT to Test Here

The following belong to **LangSmith** and/or **DeepEval / Confident AI** — do not write Jest tests for:

- LLM/AI prompt quality or output correctness
- Vertex AI / Gemini model responses
- LangGraph graph executions that call real LLMs
- Any assertion on AI-generated content

---

## ESLint Exceptions

The only permitted inline comment besides AAA markers is an eslint-disable for `any` types on mocked SDK clients:

```typescript
let mockDb: any; // eslint-disable-line @typescript-eslint/no-explicit-any
```

No other comments should appear in test files.
