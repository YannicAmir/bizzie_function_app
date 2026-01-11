import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { EarningsNotifierUseCase } from './usecase';
import { FirebaseWatchlistService } from '../../core/services/watchlist_service';
import { FmpMarketDataService } from './services/market_data_service';
import { FirestoreEarningsStorageService } from './services/earnings_storage_service';
import { FcmNotificationService } from '../../core/services/notification_service';
import { getFirebaseAdmin } from '../../core/firebase';

getFirebaseAdmin();

const fmpApiKey = defineSecret('FMP_API_KEY');

export const earningsNotifier = onSchedule(
    {
        schedule: 'every mon,tue,wed,thu,fri 08:45',
        timeZone: 'America/New_York',
        secrets: [fmpApiKey],
        memory: '512MiB',
        timeoutSeconds: 540,
    },
    async () => {
        logger.info('Starting earningsNotifier scheduled function');

        try {
            const watchlistService = new FirebaseWatchlistService();
            const marketDataService = new FmpMarketDataService(fmpApiKey.value());
            const notificationService = new FcmNotificationService();
            const earningsStorageService = new FirestoreEarningsStorageService();

            const useCase = new EarningsNotifierUseCase(
                watchlistService,
                marketDataService,
                notificationService,
                earningsStorageService
            );

            await useCase.execute();

            logger.info('earningsNotifier completed successfully');
        } catch (error) {
            logger.error('earningsNotifier failed', error);
            throw error;
        }
    }
);
