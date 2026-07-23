import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { FirebaseWatchlistService } from '../../core/services/watchlist_service';
import { FcmNotificationService } from '../../core/services/notification_service';
import { FmpSecService } from '../../core/services/sec_service';
import { FirebaseFilingHistoryService } from '../../core/services/filing_history_service';
import { FirebaseSecFilingsRepository } from '../../core/services/sec_filings_repository';
import { VertexAiService } from '../../core/services/ai_service';
import { Realtime8kNotifierUseCase } from './usecase';
import { Logger } from '../../core/logger';
import { getFirebaseAdmin } from '../../core/firebase';

getFirebaseAdmin();

const logger = new Logger('Realtime8kNotifier');

const fmpApiKey = defineSecret('FMP_API_KEY');

const EVERY_THREE_MIN_EXTENDED_HOURS_CRON = '*/3 4-20 * * 1-5';
const FUNCTION_MEMORY = '512MiB';
const HANDLER_TIMEOUT_SECONDS = 300;

const watchlistService = new FirebaseWatchlistService();
const filingHistoryService = new FirebaseFilingHistoryService();
const secFilingsRepository = new FirebaseSecFilingsRepository();
const notificationService = new FcmNotificationService();
const aiService = new VertexAiService();

export const realtime8kNotifier = onSchedule({
    schedule: EVERY_THREE_MIN_EXTENDED_HOURS_CRON,
    timeZone: 'America/New_York',
    memory: FUNCTION_MEMORY,
    maxInstances: 1,
    concurrency: 1,
    timeoutSeconds: HANDLER_TIMEOUT_SECONDS,
    secrets: [fmpApiKey]
}, async () => {

    try {
        const useCase = new Realtime8kNotifierUseCase(
            watchlistService,
            new FmpSecService(fmpApiKey.value()),
            filingHistoryService,
            secFilingsRepository,
            notificationService,
            aiService
        );

        await useCase.execute();
    } catch (error) {
        logger.error('realtime8kNotifier failed', error);
        throw error;
    }
});
