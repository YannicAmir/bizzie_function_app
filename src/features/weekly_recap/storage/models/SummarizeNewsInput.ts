import type { NewsArticle } from './NewsArticle';
import type { Filing8K } from './Filing8K';
import type { StockPrice } from './StockPrice';
import type { PriceMovement } from './PriceMovement';

export interface SummarizeNewsInput {
  ticker: string;
  companyName: string;
  news: NewsArticle[];
  filings: Filing8K[];
  prices: StockPrice[];
  priceMovement: PriceMovement;
  startDate: string;
  endDate: string;
}
