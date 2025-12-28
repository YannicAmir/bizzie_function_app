import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { EarningsNotifierUseCase } from './usecase';
import { FirebaseWatchlistService } from '../../core/services/watchlist_service';
import { FmpMarketDataService } from './services/market_data_service';
import { FcmNotificationService } from '../../core/services/notification_service';

const fmpApiKey = defineSecret('FMP_API_KEY');

export const earningsNotifier = onSchedule(
    {
        schedule: '0 9 * * *', // 9 AM EST
        timeZone: 'America/New_York',
        secrets: [fmpApiKey],
        memory: '512MiB',
    },
    async () => {
        logger.info('Starting earningsNotifier scheduled function');

        try {
            const watchlistService = new FirebaseWatchlistService();
            const marketDataService = new FmpMarketDataService(fmpApiKey.value());
            const notificationService = new FcmNotificationService();

            const useCase = new EarningsNotifierUseCase(
                watchlistService,
                marketDataService,
                notificationService
            );

            await useCase.execute();

            logger.info('earningsNotifier completed successfully');
        } catch (error) {
            logger.error('earningsNotifier failed', error);
            throw error; // Rethrow to ensure Cloud Scheduler marks it as failed
        }
    }
);
