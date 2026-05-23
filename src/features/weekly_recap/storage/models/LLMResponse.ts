import type { PriceMovement } from './PriceMovement';

export interface LLMResponse {
  time: string;
  messageTitle: string;
  messageShortSummary: string;
  messageLongSummary: string;
  confidenceScore: number;
  ticker: string;
  companyName: string;
  newArticleCount: number;
  pressReleaseCount: number;
  eightKCount: number;
  eodStockPriceCount: number;
  newsLinks: string[];
  pressReleaseLinks: string[];
  eightKLinks: string[];
  priceMovement: PriceMovement;
}

export type CountFields = Pick<
  LLMResponse,
  'newArticleCount' | 'pressReleaseCount' | 'eightKCount' | 'eodStockPriceCount'
>;
