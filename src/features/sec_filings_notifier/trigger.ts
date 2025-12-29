
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { VertexAiService } from '../../core/services/ai_service';
import { SecFilingsNotifierUseCase } from './usecase';
import { FirebaseWatchlistService } from '../../core/services/watchlist_service';
import { FcmNotificationService } from '../../core/services/notification_service';
import { FmpSecService } from '../../core/services/sec_service';
import { FirebaseFilingHistoryService } from '../../core/services/filing_history_service';

const fmpApiKey = defineSecret('FMP_API_KEY');

export const secFilingsNotifier = onSchedule(
    {
        schedule: 'every mon,tue,wed,thu,fri 09:15', // Weekdays 9:15 AM EST
        timeZone: 'America/New_York',
        secrets: [fmpApiKey],
        memory: '512MiB',
        timeoutSeconds: 540,
    },
    async () => {
        logger.info('Starting secFilingsNotifier scheduled function');

        try {
            // Instantiate Services
            const watchlistService = new FirebaseWatchlistService();
            const notificationService = new FcmNotificationService();

            // FMP Key provided via Secret Manager
            const secService = new FmpSecService(fmpApiKey.value());

            const filingHistoryService = new FirebaseFilingHistoryService();
            const aiService = new VertexAiService(); // Instantiated VertexAiService

            // Instantiate Use Case
            const useCase = new SecFilingsNotifierUseCase(
                watchlistService,
                secService,
                filingHistoryService,
                notificationService,
                aiService // Added aiService to the use case constructor
            );

            // Execute
            await useCase.execute();

            logger.info('secFilingsNotifier completed successfully');
        } catch (error) {
            logger.error('secFilingsNotifier failed', error);
            throw error; // Rethrow to ensure Cloud Scheduler marks it as failed in Console
        }
    }
);
