import { Timestamp } from 'firebase-admin/firestore';
import { GeneralNewsArticle } from './GeneralNewsArticle';

export interface StoredGeneralNews extends GeneralNewsArticle {
    newsId: string;
    publishedAt: Timestamp;
    createdAt: Timestamp;
    expireAt: Timestamp;
}
