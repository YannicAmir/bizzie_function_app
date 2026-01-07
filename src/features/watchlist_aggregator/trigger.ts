import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { WatchlistAggregatorUseCase } from './usecase';
import { GlobalWatchlistService } from './services/global_watchlist_service';
import { Logger } from '../../core/logger';

const logger = new Logger('WatchlistAggregatorTrigger');

export const watchlistAggregator = onDocumentCreated({
    document: 'users/{userId}/watchlist/{tickerId}',
    memory: '256MiB',
    timeoutSeconds: 60,
    retry: true,
}, async (event) => {
    logger.info(`Triggered watchlistAggregator for ${event.params.tickerId}`);

    const snapshot = event.data;
    if (!snapshot) {
        logger.warn('No data associated with the event');
        return;
    }

    const data = snapshot.data();
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
