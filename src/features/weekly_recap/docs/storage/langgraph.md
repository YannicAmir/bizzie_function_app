# LangGraph Implementation — Weekly Recap Storage

## Why LangGraph

Each Pub/Sub message triggers one `weeklyRecapProcessor` invocation. The pipeline has 9 discrete steps with typed data flowing between them, a conditional branch on schema validation, and a fire-and-forget terminal node. LangGraph models this as a compiled state graph — steps are explicit nodes, routing is declared, and state is typed end-to-end. This makes the execution path inspectable, individually testable, and straightforward to extend.

---

## State

Defined in `usecase.ts` using LangGraph's `Annotation.Root` pattern. Every node reads from and writes back to this single typed object.

```typescript
import { Annotation } from '@langchain/langgraph';

export const WeeklyRecapStateAnnotation = Annotation.Root({
  // Seeded by trigger.ts before graph.invoke()
  ticker:        Annotation<string>(),
  companyName:   Annotation<string>(),

  // Set by calculateWeekWindow
  startDate:     Annotation<string>(),
  endDate:       Annotation<string>(),

  // Set by fetchMarketData
  news:          Annotation<NewsArticle[]>(),
  filings:       Annotation<Filing8K[]>(),
  prices:        Annotation<StockPrice[]>(),

  // Set by calculateDeterministicFields
  counts:        Annotation<CountFields>(),
  priceMovement: Annotation<PriceMovement>(),

  // Set by summarizeNews
  llmPartial:    Annotation<Partial<LLMResponse>>(),

  // Set by assembleResponse, updated by postProcessResponse
  llmResponse:   Annotation<LLMResponse>(),
});

export type WeeklyRecapState = typeof WeeklyRecapStateAnnotation.State;
```

---

## Node Signature Pattern

Every node is a plain async function in its own file under `nodes/`. Services are injected via closure at graph construction time — not imported as globals.

```typescript
// nodes/fetchMarketData.ts
export function makeFetchMarketDataNode(fmp: FmpService) {
  return async (state: WeeklyRecapState): Promise<Partial<WeeklyRecapState>> => {
    const [newsResult, filingsResult, pricesResult] = await Promise.allSettled([
      fmp.getNews(state.ticker, state.startDate, state.endDate),
      fmp.get8Ks(state.ticker, state.startDate, state.endDate),
      fmp.getEodStockPrice(state.ticker, state.startDate, state.endDate),
    ]);

    // Each call is independent — a failure defaults to [] so the graph
    // continues with partial data. The LLM is instructed to omit missing aspects.
    return {
      news:    newsResult.status === 'fulfilled' ? newsResult.value : [],
      filings: filingsResult.status === 'fulfilled' ? filingsResult.value : [],
      prices:  pricesResult.status === 'fulfilled' ? pricesResult.value : [],
    };
  };
}
```

Every node returns `Partial<WeeklyRecapState>` — only the keys it writes. LangGraph merges the partial back into state.

---

## Graph Construction

The graph is compiled **once per cold-start** in `trigger.ts` — `buildGraph` is exported from `usecase.ts` and called at module scope in `trigger.ts` alongside all service instantiation. Compilation is expensive and must not happen per invocation.

```typescript
import { StateGraph, START, END } from '@langchain/langgraph';

function buildGraph(fmp: FmpService, ai: AiService, db: FirestoreService) {
  return new StateGraph(WeeklyRecapStateAnnotation)
    .addNode('calculateWeekWindow',          makeCalculateWeekWindowNode())
    .addNode('fetchMarketData',              makeFetchMarketDataNode(fmp))
    .addNode('calculateDeterministicFields', makeCalculateDeterministicFieldsNode())
    .addNode('summarizeNews',                makeSummarizeNewsNode(ai))
    .addNode('validateSchema',               makeValidateSchemaNode())
    .addNode('assembleResponse',             makeAssembleResponseNode())
    .addNode('postProcessResponse',          makePostProcessResponseNode(ai))
    .addNode('storeSummary',                 makeStoreSummaryNode(db))
    .addEdge(START,                          'calculateWeekWindow')
    .addEdge('calculateWeekWindow',          'fetchMarketData')
    .addEdge('fetchMarketData',              'calculateDeterministicFields')
    .addEdge('calculateDeterministicFields', 'summarizeNews')
    .addEdge('summarizeNews',                'validateSchema')
    .addConditionalEdges('validateSchema', routeAfterValidation, {
      continue: 'assembleResponse',
      end:      END,
    })
    .addEdge('assembleResponse',             'postProcessResponse')
    .addEdge('postProcessResponse',          'storeSummary')
    .addEdge('storeSummary',                 END)
    .compile();
}
```

---

## Conditional Routing

```typescript
// isValidLLMPartial is defined in and exported from nodes/validateSchema.ts
function routeAfterValidation(state: WeeklyRecapState): 'continue' | 'end' {
  return state.llmPartial && isValidLLMPartial(state.llmPartial) ? 'continue' : 'end';
}
```

On `'end'`: the `validateSchema` node has already logged each invalid field. The graph completes normally — the message is acknowledged and Pub/Sub does not retry. The node intentionally does not throw: throwing would bypass `routeAfterValidation` and trigger unwanted Pub/Sub retries for a non-retriable failure.

---

## Invocation

```typescript
// trigger.ts → weeklyRecapProcessor
const graph = buildGraph(fmpService, aiService, firestoreService);
await graph.invoke({ ticker, companyName });
```
