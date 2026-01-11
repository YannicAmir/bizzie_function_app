import { Logger } from '../../../core/logger';
import { getFirebaseAdmin } from '../../../core/firebase';
import { EarningsEvent } from './market_data_service';

const _logger = new Logger('Earnings Storage Service');

export interface EarningsStorageService {
    saveUpcomingEarnings(events: EarningsEvent[]): Promise<void>;
}

export class FirestoreEarningsStorageService implements EarningsStorageService {

    async saveUpcomingEarnings(events: EarningsEvent[]): Promise<void> {
        if (events.length === 0) {
            _logger.info('No upcoming earnings to save.');
            return;
        }

        const db = getFirebaseAdmin().firestore();
        const collectionRef = db.collection('upcoming_earnings');
        const CHUNK_SIZE = 500;

        let totalSaved = 0;
        const totalBatches = Math.ceil(events.length / CHUNK_SIZE);

        for (let i = 0; i < events.length; i += CHUNK_SIZE) {
            const chunk = events.slice(i, i + CHUNK_SIZE);
            const batch = db.batch();

            for (const event of chunk) {
                const docRef = collectionRef.doc(event.symbol);

                const eventDate = new Date(event.date);
                const expireAt = new Date(eventDate);
                expireAt.setDate(expireAt.getDate() + 2);

                batch.set(docRef, {
                    symbol: event.symbol,
                    date: event.date,
                    expireAt: expireAt
                });
            }

            try {
                await batch.commit();
                totalSaved += chunk.length;
                _logger.info(`Batch ${Math.ceil((i + 1) / CHUNK_SIZE)}/${totalBatches} committed. (${chunk.length} items)`);
            } catch (error) {
                _logger.error('Failed to save upcoming earnings batch. Continuing flow to ensure notifications are sent.', error);
            }
        }

        _logger.info(`Successfully saved ${totalSaved} upcoming earnings.`);
    }
}
