---
name: langgraph typescript best practice
description: Best practices for LangGraph in Node.js TypeScript Cloud Functions — Annotation.Root state, node factory pattern, service injection via closure, cold-start graph compilation, conditional routing, and invocation.
---

# Instructions for LangGraph (TypeScript) in Cloud Functions

## 1. Package and imports

```typescript
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
```

## 2. State definition — Annotation.Root

Define state in `usecase.ts` using `Annotation.Root`. Every field the graph touches must be declared here:

```typescript
export const MyStateAnnotation = Annotation.Root({
  // Seeded by trigger before graph.invoke()
  ticker:      Annotation<string>(),
  companyName: Annotation<string>(),

  // Written by intermediate nodes
  startDate:   Annotation<string>(),
  data:        Annotation<DataType[]>(),
  llmResult:   Annotation<LLMOutput>(),
});

export type MyState = typeof MyStateAnnotation.State;
```

- Every node reads from `MyState` and returns `Partial<MyState>`
- Only declare fields that nodes actually read or write — no unused fields
- All fields are optional in state until written; nodes must handle `undefined` from earlier state

## 3. Node factory pattern — services injected via closure

Every node lives in its own file under `nodes/`. Services are NOT imported as globals inside node files — they are injected via a factory function at graph construction time:

```typescript
// nodes/fetchData.ts
import { MyService } from '../services/my_service';
import { MyState } from '../usecase';

export function makeFetchDataNode(service: MyService) {
  return async (state: MyState): Promise<Partial<MyState>> => {
    const result = await service.getData(state.ticker);
    return { data: result };
  };
}
```

**Rules:**
- File name: `camelCase.ts` (e.g., `fetchMarketData.ts`, `validateSchema.ts`)
- Export only the factory function — no class, no default export
- Return type is always `Promise<Partial<MyState>>` — only return the keys this node writes
- Pure nodes (no service) use `makeXNode()` with no parameters:  `export function makeCalculateWeekWindowNode() { return async (state) => ... }`

## 4. Graph construction — compile once at cold-start

Build and compile the graph at module scope in `usecase.ts`. Compilation is expensive — never do it inside a request handler:

```typescript
import { StateGraph, START, END } from '@langchain/langgraph';

function buildGraph(svcA: ServiceA, svcB: ServiceB) {
  return new StateGraph(MyStateAnnotation)
    .addNode('stepOne',   makeStepOneNode(svcA))
    .addNode('stepTwo',   makeStepTwoNode(svcB))
    .addNode('stepThree', makeStepThreeNode())
    .addEdge(START,       'stepOne')
    .addEdge('stepOne',   'stepTwo')
    .addEdge('stepTwo',   'stepThree')
    .addEdge('stepThree', END)
    .compile();
}

// Cold-start: build once, reuse across invocations
export const graph = buildGraph(serviceAInstance, serviceBInstance);
```

Node names in `.addNode()` must exactly match string keys used in `.addEdge()` and `.addConditionalEdges()`.

## 5. Conditional routing

Use `addConditionalEdges` for branching. The routing function returns a string key that maps to a node name:

```typescript
function routeAfterValidation(state: MyState): 'continue' | 'end' {
  return isValid(state.llmResult) ? 'continue' : 'end';
}

// In buildGraph():
.addConditionalEdges('validateSchema', routeAfterValidation, {
  continue: 'assembleResponse',
  end:      END,
})
```

- The routing function receives the full state and returns a key string
- The map object maps key strings to node names or `END`
- Define the routing function in `usecase.ts` (not in the node file)

## 6. Invocation from trigger.ts

```typescript
// trigger.ts
import { graph } from './usecase';

// Inside the Cloud Function handler:
await graph.invoke({ ticker, companyName });
```

- Seed only the fields the first node needs — LangGraph initialises everything else to `undefined`
- `graph.invoke()` returns the final state — only use it if you need the output; for side-effect graphs (write to Firestore) the return value is not needed

## 7. Fire-and-forget terminal nodes

For terminal nodes that should not block the pipeline (e.g., evaluation):

```typescript
// nodes/evaluateSummary.ts
export function makeEvaluateSummaryNode(ai: AiService) {
  return async (state: MyState): Promise<Partial<MyState>> => {
    // Fire-and-forget — do NOT await, catch errors in-place
    ai.evaluate(state).catch((err) => {
      logger.warn('Evaluation failed (non-blocking)', { ticker: state.ticker, error: (err as Error).message });
    });
    return {}; // return immediately
  };
}
```

## 8. Error handling inside nodes

- Throw from a node to signal a retryable failure (Pub/Sub will retry the message)
- Return partial state with a sentinel value to signal a non-fatal skip (use conditional routing to handle it)
- Always log errors with the `logger` before throwing or returning

```typescript
try {
  const result = await service.call(state.ticker);
  return { data: result };
} catch (err) {
  logger.error('Node failed', { node: 'fetchData', ticker: state.ticker, error: (err as Error).message });
  throw err; // re-throw → message will be retried by Pub/Sub
}
```

## 9. File structure

```
src/features/<feature>/<sub_feature>/
├── trigger.ts         ← imports graph from usecase.ts, invokes it
├── usecase.ts         ← state annotation, buildGraph(), exported graph instance
├── nodes/
│   ├── stepOne.ts
│   ├── stepTwo.ts
│   └── ...
└── services/
    └── ...
```

## 10. Prompt management — LangSmith hub + local source fallback

Prompts live in source code during development using `{variable}` placeholder syntax. In deployed environments they are pulled from LangSmith Prompt Hub, enabling prompt changes without redeployment.

### Source format

One prompts file per feature sub-folder:

```
src/features/<feature>/<sub_feature>/prompts/<sub_feature>_prompts.ts
```

```typescript
// prompts/weeklyRecapPrompts.ts
export const WEEKLY_RECAP_SUMMARY_PROMPT = `
You are a financial analyst. Summarize the weekly performance for {ticker} ({companyName})
for the week ending {weekEndDate}.

Data:
{weeklyData}

Return JSON matching this schema:
{responseSchema}
`.trim();
```

Rules:
- Constants are `UPPER_SNAKE_CASE` — they map to LangSmith hub names (converted to `kebab-case`): `WEEKLY_RECAP_SUMMARY_PROMPT` → `weekly-recap-summary-prompt`
- Use `{variable}` placeholders — **never** string interpolation (`${variable}`) inside the constant
- Export each prompt as a named `const` — no default export, no template classes

### Runtime loading utility (`src/core/prompts.ts`)

Create once and reuse across features. Pulls from LangSmith hub when `LANGSMITH_API_KEY` is present; falls back to local template otherwise:

```typescript
import { PromptTemplate } from '@langchain/core/prompts';
import { pull } from 'langchain/hub';
import { logger } from './logger';

export async function loadPrompt(
  hubName: string,
  localTemplate: string,
  variables: Record<string, string>,
): Promise<string> {
  if (process.env.LANGSMITH_API_KEY) {
    try {
      const template = await pull<PromptTemplate>(hubName);
      return template.format(variables);
    } catch (err) {
      logger.warn('LangSmith prompt pull failed — using local fallback', {
        prompt: hubName,
        error: (err as Error).message,
      });
    }
  }
  return PromptTemplate.fromTemplate(localTemplate).format(variables);
}
```

Usage inside an AI service method or LangGraph node:

```typescript
import { loadPrompt } from '../../../../core/prompts';
import { WEEKLY_RECAP_SUMMARY_PROMPT } from '../prompts/weeklyRecapPrompts';

const prompt = await loadPrompt(
  'weekly-recap-summary-prompt',
  WEEKLY_RECAP_SUMMARY_PROMPT,
  { ticker, companyName, weekEndDate, weeklyData, responseSchema },
);
```

### LangSmith environment setup

Load `LANGSMITH_API_KEY` from Secret Manager at cold-start (same pattern as `CONFIDENT_API_KEY`). Leave it unset in local dev to skip hub pulls and use local templates directly.

### Prompt sync agent

A `PromptSyncAgent` pushes local prompt constants to LangSmith hub. Trigger it when prompts are ready to be versioned:

> "sync prompts for src/features/weekly_recap/storage to LangSmith"

The agent:
1. Reads all `prompts/<name>_prompts.ts` files in the feature directory
2. Extracts exported `UPPER_SNAKE_CASE` constants
3. Derives the hub name (`WEEKLY_RECAP_SUMMARY_PROMPT` → `weekly-recap-summary-prompt`)
4. Pushes each via `langsmith.Client.pushPrompt()`
5. Reports which prompts were created or updated in the hub

This decouples source development from hub state — prompts are always reviewable in code, always versionable in LangSmith.

---

## 11. Anti-patterns to avoid

- Never call `buildGraph()` or `.compile()` inside a Cloud Function handler — always at module scope
- Never import services directly inside node files — inject via factory closure
- Never use global/shared mutable state in nodes — only read/write `state`
- Never return the full state from a node — only return `Partial<MyState>` with the keys written
- Never use `@langchain/langgraph`'s in-memory or persisted checkpointers in Cloud Functions — stateless invocation only

---

## Checklist

- [ ] State defined with `Annotation.Root` in `usecase.ts`
- [ ] `typeof XAnnotation.State` exported as the state type alias
- [ ] Every node is a factory function returning `async (state) => Partial<State>`
- [ ] Services injected via factory closure, not imported as globals in node files
- [ ] Graph compiled once at module scope (`export const graph = buildGraph(...)`)
- [ ] Node names in `.addNode()` match exactly those used in `.addEdge()` / `.addConditionalEdges()`
- [ ] Conditional routing function defined in `usecase.ts`, returns string key
- [ ] `graph.invoke()` called from `trigger.ts` with only the seed fields
- [ ] Fire-and-forget terminal nodes use `.catch()` and return `{}` immediately
- [ ] Prompts defined as `UPPER_SNAKE_CASE` named constants in `prompts/<sub_feature>_prompts.ts` using `{variable}` placeholders
- [ ] `loadPrompt()` used at the call site — never inline string interpolation inside prompt constants
- [ ] `LANGSMITH_API_KEY` loaded from Secret Manager at cold-start; absent in local dev triggers local fallback
