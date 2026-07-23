
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { VertexAiService } from '../../core/services/ai_service';
import { SecFilingsNotifierUseCase } from './usecase';
import { FirebaseWatchlistService } from '../../core/services/watchlist_service';
import { FcmNotificationService } from '../../core/services/notification_service';
import { FmpSecService } from '../../core/services/sec_service';
import { FirebaseFilingHistoryService } from '../../core/services/filing_history_service';
import { FirebaseSecFilingsRepository } from '../../core/services/sec_filings_repository';
import { getFirebaseAdmin } from '../../core/firebase';
import { Logger } from '../../core/logger';

getFirebaseAdmin();

const _logger = new Logger('Sec Filings Notifier');

const fmpApiKey = defineSecret('FMP_API_KEY');

const MARKET_HOURS_WEEKDAYS_CRON = '0 5-22 * * 1-5';
const FUNCTION_MEMORY = '512MiB';
const HANDLER_TIMEOUT_SECONDS = 540;
// maxInstances and concurrency together enforce a single non-overlapping run.
const SINGLE_RUN_INSTANCE_LIMIT = 1;

const watchlistService = new FirebaseWatchlistService();
const notificationService = new FcmNotificationService();
const filingHistoryService = new FirebaseFilingHistoryService();
const aiService = new VertexAiService();
const secFilingsRepository = new FirebaseSecFilingsRepository();

export const secFilingsNotifier = onSchedule(
    {
        schedule: MARKET_HOURS_WEEKDAYS_CRON,
        timeZone: 'America/New_York',
        secrets: [fmpApiKey],
        memory: FUNCTION_MEMORY,
        maxInstances: SINGLE_RUN_INSTANCE_LIMIT,
        concurrency: SINGLE_RUN_INSTANCE_LIMIT,
        timeoutSeconds: HANDLER_TIMEOUT_SECONDS,
    },
    async () => {
        _logger.info('Starting secFilingsNotifier scheduled function');

        try {
            const secService = new FmpSecService(fmpApiKey.value());

            const useCase = new SecFilingsNotifierUseCase(
                watchlistService,
                secService,
                filingHistoryService,
                notificationService,
                aiService,
                secFilingsRepository
            );

            await useCase.execute();

            _logger.info('secFilingsNotifier completed successfully');
        } catch (error) {
            _logger.error('secFilingsNotifier failed', error);
            throw error;
        }
    }
);
