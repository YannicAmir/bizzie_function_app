import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';
import { FieldValue } from 'firebase-admin/firestore';

const logger = new Logger('GlobalWatchlistService');

interface WatchlistDocument {
    ticker: string;
    lastAddedAt: FieldValue;
    companyName?: string;
}

export class GlobalWatchlistService {
    async upsertToGlobalList(ticker: string, companyName: string): Promise<void> {
        try {
            const firestore = getFirebaseAdmin().firestore();
            const docRef = firestore.collection('watchlist').doc(ticker);

            const data: WatchlistDocument = {
                ticker,
                lastAddedAt: FieldValue.serverTimestamp(),
            };

            if (companyName) {
                data.companyName = companyName;
            }

            await docRef.set(data, { merge: true });
            logger.info(`Upserted ${ticker} to global watchlist.`);
        } catch (error) {
            logger.error(`Failed to upsert ${ticker} to global watchlist`, error);
            throw error;
        }
    }
}
