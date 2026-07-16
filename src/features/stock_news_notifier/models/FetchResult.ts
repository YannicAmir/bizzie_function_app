import { StockNewsArticle } from './StockNewsArticle';

export interface FetchResult {
    articles: StockNewsArticle[];
    pagesFetched: number;
    reachedOverlap: boolean;
    maxPublishedDate: string;
}
