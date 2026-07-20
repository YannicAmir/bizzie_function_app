import { Timestamp } from 'firebase-admin/firestore';
import { PriceSnapshot } from './PriceSnapshot';

export interface StoredStockPrice extends PriceSnapshot {
    updatedAt: Timestamp;
}
