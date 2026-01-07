import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { WatchlistAggregatorUseCase } from './usecase';
import { GlobalWatchlistService } from './services/global_watchlist_service';
import { Logger } from '../../core/logger';

import { getFirebaseAdmin } from '../../core/firebase';

// Ensure Firebase is initialized at global scope (Cold Start)
getFirebaseAdmin();

const logger = new Logger('SyncWatchlistTrigger');

export const syncWatchlist = onDocumentWritten({
    document: 'users/{userId}/watchlist/{tickerId}',
    memory: '256MiB',
    timeoutSeconds: 60,
    retry: true,
}, async (event) => {
    logger.info(`Triggered syncWatchlist for ${event.params.tickerId}`);

    // onDocumentWritten event.data has { before, after }
    const snapshot = event.data;
    if (!snapshot) {
        logger.warn('No data associated with the event');
        return;
    }

    const after = snapshot.after;
    const before = snapshot.before;

    // If 'after' doesn't exist, it's a Deletion. We don't remove from global watchlist (append-only).
    if (!after.exists) {
        logger.info('Document deleted. Global watchlist is append-only, ignoring.');
        return;
    }

    // If 'before' exists and 'after' exists, it's an Update.
    // We proceed to sync in case the company name usage changed or just to ensure consistency.

    const data = after.data();
    if (!data) {
        return;
    }

    const tickerId = event.params.tickerId;
    const ticker = data.ticker || tickerId;
    const companyName = data.companyName || '';

    const service = new GlobalWatchlistService();
    const useCase = new WatchlistAggregatorUseCase(service);

    try {
        await useCase.execute(ticker, companyName);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        const isTransient = errorMessage.includes('UNAVAILABLE') ||
            errorMessage.includes('DEADLINE_EXCEEDED') ||
            errorMessage.includes('INTERNAL') ||
            errorMessage.includes('network');

        if (isTransient) {
            logger.warn(`Transient error in watchlistAggregator, re-throwing to retry: ${errorMessage}`);
            throw error;
        } else {
            logger.error(`Permanent failure in watchlistAggregator (will not retry): ${errorMessage}`);
        }
    }
});
