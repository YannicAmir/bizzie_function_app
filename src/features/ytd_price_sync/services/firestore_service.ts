import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';
import { YTD_PRICE_CHANGE_COLLECTION } from '../constants';
import { YtdChangeSnapshot } from '../models/YtdChangeSnapshot';
import { StoredYtdChange } from '../models/StoredYtdChange';

const _logger = new Logger('Ytd Price Firestore Service');

type YtdWrite = Omit<StoredYtdChange, 'updatedAt'> & { updatedAt: FieldValue };

export class FirestoreService {
    async upsertYtd(snapshot: YtdChangeSnapshot): Promise<void> {
        if (!snapshot.ticker) {
            throw new Error('upsertYtd: snapshot.ticker is required');
        }

        const ref = getFirebaseAdmin()
            .firestore()
            .collection(YTD_PRICE_CHANGE_COLLECTION)
            .doc(snapshot.ticker);

        const payload: YtdWrite = {
            ...snapshot,
            updatedAt: FieldValue.serverTimestamp(),
        };

        try {
            await ref.set(payload);
        } catch (error) {
            _logger.error(`Failed to upsert YTD change for ${snapshot.ticker}`, error);
            throw error;
        }
    }
}
