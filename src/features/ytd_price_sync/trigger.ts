import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { getFirebaseAdmin } from '../../core/firebase';
import { Logger } from '../../core/logger';
import { FirebaseWatchlistService } from '../../core/services/watchlist_service';
import {
    FEATURE_NAME,
    FUNCTION_MAX_INSTANCES,
    FUNCTION_MEMORY,
    FUNCTION_TIMEOUT_SECONDS,
    SCHEDULE,
    TIMEZONE,
} from './constants';
import { FirestoreService } from './services/firestore_service';
import { FmpEodService } from './services/fmp_eod_service';
import { YtdPriceSyncUseCase } from './usecase';

getFirebaseAdmin();

const fmpApiKey = defineSecret('FMP_API_KEY');

const logger = new Logger(FEATURE_NAME);

const firestoreService = new FirestoreService();
const watchlistService = new FirebaseWatchlistService();

let fmpEodService: FmpEodService | undefined;

export const ytdPriceSync = onSchedule({
    schedule: SCHEDULE,
    timeZone: TIMEZONE,
    memory: FUNCTION_MEMORY,
    timeoutSeconds: FUNCTION_TIMEOUT_SECONDS,
    maxInstances: FUNCTION_MAX_INSTANCES,
    secrets: [fmpApiKey],
}, async () => {

    const apiKey = fmpApiKey.value();
    if (!apiKey) {
        logger.error('Missing FMP_API_KEY');
        throw new Error('Missing FMP_API_KEY secret');
    }

    fmpEodService ??= new FmpEodService(apiKey);

    const useCase = new YtdPriceSyncUseCase(fmpEodService, firestoreService, watchlistService);

    try {
        await useCase.execute();
    } catch (error) {
        logger.error('YTD price sync run failed', error);
    }
});
