import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { getFirebaseAdmin } from '../../core/firebase';
import { Logger } from '../../core/logger';
import { FEATURE_NAME, FUNCTION_TIMEOUT_SECONDS, MAX_INSTANCES, MEMORY, SCHEDULE, TIMEZONE } from './constants';
import { FirestoreService } from './services/firestore_service';
import { FmpNewsService } from './services/fmp_news_service';
import { GeneralMarketNewsUseCase } from './usecase';

getFirebaseAdmin();

const fmpApiKey = defineSecret('FMP_API_KEY');

const logger = new Logger(FEATURE_NAME);

const firestoreService = new FirestoreService();

export const generalMarketNews = onSchedule({
    schedule: SCHEDULE,
    timeZone: TIMEZONE,
    memory: MEMORY,
    timeoutSeconds: FUNCTION_TIMEOUT_SECONDS,
    maxInstances: MAX_INSTANCES,
    secrets: [fmpApiKey],
}, async () => {

    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) {
        logger.error('Missing FMP_API_KEY');
        return;
    }

    const useCase = new GeneralMarketNewsUseCase(
        new FmpNewsService(apiKey),
        firestoreService,
    );

    try {
        await useCase.execute();
    } catch (error) {
        logger.error('General market news run failed', error);
    }
});
