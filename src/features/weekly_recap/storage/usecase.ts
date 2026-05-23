import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { FmpService } from './services/fmp_service';
import { AiService } from './services/ai_service';
import { FirestoreService } from './services/firestore_service';
import { makeCalculateWeekWindowNode } from './nodes/calculateWeekWindow';
import { makeFetchMarketDataNode } from './nodes/fetchMarketData';
import { makeCalculateDeterministicFieldsNode } from './nodes/calculateDeterministicFields';
import { makeSummarizeNewsNode } from './nodes/summarizeNews';
import { makeValidateSchemaNode, isValidLLMPartial } from './nodes/validateSchema';
import { makeAssembleResponseNode } from './nodes/assembleResponse';
import { makePostProcessResponseNode } from './nodes/postProcessResponse';
import { makeStoreSummaryNode } from './nodes/storeSummary';
import type { NewsArticle, PressRelease, Filing8K, StockPrice, PriceMovement, LLMResponse, CountFields } from './models';

export const WeeklyRecapStateAnnotation = Annotation.Root({
  ticker: Annotation<string>(),
  companyName: Annotation<string>(),
  startDate: Annotation<string>(),
  endDate: Annotation<string>(),
  news: Annotation<NewsArticle[]>(),
  pressReleases: Annotation<PressRelease[]>(),
  filings: Annotation<Filing8K[]>(),
  prices: Annotation<StockPrice[]>(),
  counts: Annotation<CountFields>(),
  priceMovement: Annotation<PriceMovement>(),
  llmPartial: Annotation<Partial<LLMResponse>>(),
  llmResponse: Annotation<LLMResponse>(),
});

export type WeeklyRecapState = typeof WeeklyRecapStateAnnotation.State;

function routeAfterValidation(state: WeeklyRecapState): 'continue' | 'end' {
  return state.llmPartial && isValidLLMPartial(state.llmPartial) ? 'continue' : 'end';
}

export function buildGraph(fmp: FmpService, ai: AiService, db: FirestoreService) {
  return new StateGraph(WeeklyRecapStateAnnotation)
    .addNode('calculateWeekWindow', makeCalculateWeekWindowNode())
    .addNode('fetchMarketData', makeFetchMarketDataNode(fmp))
    .addNode('calculateDeterministicFields', makeCalculateDeterministicFieldsNode())
    .addNode('summarizeNews', makeSummarizeNewsNode(ai))
    .addNode('validateSchema', makeValidateSchemaNode())
    .addNode('assembleResponse', makeAssembleResponseNode())
    .addNode('postProcessResponse', makePostProcessResponseNode(ai))
    .addNode('storeSummary', makeStoreSummaryNode(db))
    .addEdge(START, 'calculateWeekWindow')
    .addEdge('calculateWeekWindow', 'fetchMarketData')
    .addEdge('fetchMarketData', 'calculateDeterministicFields')
    .addEdge('calculateDeterministicFields', 'summarizeNews')
    .addEdge('summarizeNews', 'validateSchema')
    .addConditionalEdges('validateSchema', routeAfterValidation, {
      continue: 'assembleResponse',
      end: END,
    })
    .addEdge('assembleResponse', 'postProcessResponse')
    .addEdge('postProcessResponse', 'storeSummary')
    .addEdge('storeSummary', END)
    .compile();
}
