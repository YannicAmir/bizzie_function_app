import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';
import { STOCK_PRICES_COLLECTION } from '../constants';
import { PriceSnapshot } from '../models/PriceSnapshot';
import { StoredStockPrice } from '../models/StoredStockPrice';

const _logger = new Logger('Stock Price Firestore Service');

type StockPriceWrite = Omit<StoredStockPrice, 'updatedAt'> & { updatedAt: FieldValue };

export class FirestoreService {
    async upsertPrice(snapshot: PriceSnapshot): Promise<void> {
        if (!snapshot.ticker) {
            throw new Error('upsertPrice: snapshot.ticker is required');
        }

        const ref = getFirebaseAdmin()
            .firestore()
            .collection(STOCK_PRICES_COLLECTION)
            .doc(snapshot.ticker);

        const payload: StockPriceWrite = {
            ...snapshot,
            updatedAt: FieldValue.serverTimestamp(),
        };

        try {
            await ref.set(payload);
        } catch (error) {
            _logger.error(`Failed to upsert price for ${snapshot.ticker}`, error);
            throw error;
        }
    }
}
