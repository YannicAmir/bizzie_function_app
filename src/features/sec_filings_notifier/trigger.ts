
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { VertexAiService } from '../../core/services/ai_service';
import { SecFilingsNotifierUseCase } from './usecase';
import { FirebaseWatchlistService } from '../../core/services/watchlist_service';
import { FcmNotificationService } from '../../core/services/notification_service';
import { FmpSecService } from '../../core/services/sec_service';
import { FirebaseFilingHistoryService } from '../../core/services/filing_history_service';
import { getFirebaseAdmin } from '../../core/firebase';

getFirebaseAdmin();

const fmpApiKey = defineSecret('FMP_API_KEY');

export const secFilingsNotifier = onSchedule(
    {
        schedule: '0 5-22 * * 1-5',
        timeZone: 'America/New_York',
        secrets: [fmpApiKey],
        memory: '512MiB',
        timeoutSeconds: 540,
    },
    async () => {
        logger.info('Starting secFilingsNotifier scheduled function');

        try {
            const watchlistService = new FirebaseWatchlistService();
            const notificationService = new FcmNotificationService();

            const secService = new FmpSecService(fmpApiKey.value());

            const filingHistoryService = new FirebaseFilingHistoryService();
            const aiService = new VertexAiService();

            const useCase = new SecFilingsNotifierUseCase(
                watchlistService,
                secService,
                filingHistoryService,
                notificationService,
                aiService
            );

            await useCase.execute();

            logger.info('secFilingsNotifier completed successfully');
        } catch (error) {
            logger.error('secFilingsNotifier failed', error);
            throw error;
        }
    }
);
