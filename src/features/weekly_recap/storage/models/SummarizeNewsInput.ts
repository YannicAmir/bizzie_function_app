import type { NewsArticle } from './NewsArticle';
import type { PressRelease } from './PressRelease';
import type { Filing8K } from './Filing8K';
import type { StockPrice } from './StockPrice';
import type { PriceMovement } from './PriceMovement';

export interface SummarizeNewsInput {
  ticker: string;
  companyName: string;
  news: NewsArticle[];
  pressReleases: PressRelease[];
  filings: Filing8K[];
  prices: StockPrice[];
  priceMovement: PriceMovement;
  startDate: string;
  endDate: string;
}
