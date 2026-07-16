import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { getFirebaseAdmin } from '../../core/firebase';
import { Logger } from '../../core/logger';
import { FirebaseWatchlistService } from '../../core/services/watchlist_service';
import { FEATURE_NAME, SCHEDULE, TIMEZONE } from './constants';
import { FcmService } from './services/fcm_service';
import { FirestoreService } from './services/firestore_service';
import { FmpNewsService } from './services/fmp_news_service';
import { StockNewsNotifierUseCase } from './usecase';

getFirebaseAdmin();

const fmpApiKey = defineSecret('FMP_API_KEY');

const logger = new Logger(FEATURE_NAME);

const firestoreService = new FirestoreService();
const fcmService = new FcmService();
const watchlistService = new FirebaseWatchlistService();

export const stockNewsNotifier = onSchedule({
    schedule: SCHEDULE,
    timeZone: TIMEZONE,
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 1,
    secrets: [fmpApiKey],
}, async () => {

    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) {
        logger.error('Missing FMP_API_KEY');
        return;
    }

    const useCase = new StockNewsNotifierUseCase(
        new FmpNewsService(apiKey),
        firestoreService,
        fcmService,
        watchlistService,
    );

    try {
        await useCase.execute();
    } catch (error) {
        logger.error('Stock news notifier run failed', error);
    }
});
