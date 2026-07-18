import { Timestamp } from 'firebase-admin/firestore';
import { StockNewsArticle } from './StockNewsArticle';

export interface StoredStockNews extends StockNewsArticle {
    newsId: string;
    publishedAt: Timestamp;
    createdAt: Timestamp;
    expireAt: Timestamp;
}
