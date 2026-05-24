import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { FmpService } from './services/fmp_service';
import { AiService } from './services/ai_service';
import { FirestoreService } from './services/firestore_service';
import { PubSubService } from './services/pubsub_service';
import { makeCalculateWeekWindowNode } from './nodes/calculateWeekWindow';
import { makeFetchMarketDataNode } from './nodes/fetchMarketData';
import { makeCalculateDeterministicFieldsNode } from './nodes/calculateDeterministicFields';
import { makeSummarizeNewsNode } from './nodes/summarizeNews';
import { makeValidateSchemaNode, isValidLLMPartial } from './nodes/validateSchema';
import { makeAssembleResponseNode } from './nodes/assembleResponse';
import { makePostProcessResponseNode } from './nodes/postProcessResponse';
import { makeStoreSummaryNode } from './nodes/storeSummary';
import type { NewsArticle, Filing8K, StockPrice, PriceMovement, LLMResponse, CountFields } from './models';

export const WeeklyRecapStateAnnotation = Annotation.Root({
  ticker: Annotation<string>(),
  companyName: Annotation<string>(),
  startDate: Annotation<string>(),
  endDate: Annotation<string>(),
  news: Annotation<NewsArticle[]>(),
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

const NODES = {
  CALCULATE_WEEK_WINDOW:          'calculateWeekWindow',
  FETCH_MARKET_DATA:              'fetchMarketData',
  CALCULATE_DETERMINISTIC_FIELDS: 'calculateDeterministicFields',
  SUMMARIZE_NEWS:                 'summarizeNews',
  VALIDATE_SCHEMA:                'validateSchema',
  ASSEMBLE_RESPONSE:              'assembleResponse',
  POST_PROCESS_RESPONSE:          'postProcessResponse',
  STORE_SUMMARY:                  'storeSummary',
} as const;

export async function runScheduler(
  db: FirestoreService,
  pubSub: PubSubService,
): Promise<{ companiesCount: number; published: number }> {
  const companies = await db.retrieveCompaniesFromDb();
  const published = await pubSub.queueCompanies(companies);
  return { companiesCount: companies.length, published };
}

export function buildGraph(fmp: FmpService, ai: AiService, db: FirestoreService) {
  return new StateGraph(WeeklyRecapStateAnnotation)
    .addNode(NODES.CALCULATE_WEEK_WINDOW,          makeCalculateWeekWindowNode())
    .addNode(NODES.FETCH_MARKET_DATA,              makeFetchMarketDataNode(fmp))
    .addNode(NODES.CALCULATE_DETERMINISTIC_FIELDS, makeCalculateDeterministicFieldsNode())
    .addNode(NODES.SUMMARIZE_NEWS,                 makeSummarizeNewsNode(ai))
    .addNode(NODES.VALIDATE_SCHEMA,                makeValidateSchemaNode())
    .addNode(NODES.ASSEMBLE_RESPONSE,              makeAssembleResponseNode())
    .addNode(NODES.POST_PROCESS_RESPONSE,          makePostProcessResponseNode(ai))
    .addNode(NODES.STORE_SUMMARY,                  makeStoreSummaryNode(db))
    .addEdge(START,                                NODES.CALCULATE_WEEK_WINDOW)
    .addEdge(NODES.CALCULATE_WEEK_WINDOW,          NODES.FETCH_MARKET_DATA)
    .addEdge(NODES.FETCH_MARKET_DATA,              NODES.CALCULATE_DETERMINISTIC_FIELDS)
    .addEdge(NODES.CALCULATE_DETERMINISTIC_FIELDS, NODES.SUMMARIZE_NEWS)
    .addEdge(NODES.SUMMARIZE_NEWS,                 NODES.VALIDATE_SCHEMA)
    .addConditionalEdges(NODES.VALIDATE_SCHEMA, routeAfterValidation, {
      continue: NODES.ASSEMBLE_RESPONSE,
      end:      END,
    })
    .addEdge(NODES.ASSEMBLE_RESPONSE,    NODES.POST_PROCESS_RESPONSE)
    .addEdge(NODES.POST_PROCESS_RESPONSE, NODES.STORE_SUMMARY)
    .addEdge(NODES.STORE_SUMMARY,         END)
    .compile();
}
