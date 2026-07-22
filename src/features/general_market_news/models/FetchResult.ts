import { GeneralNewsArticle } from './GeneralNewsArticle';

export interface FetchResult {
    articles: GeneralNewsArticle[];
    pagesFetched: number;
    reachedOverlap: boolean;
    maxPublishedDate: string;
}
