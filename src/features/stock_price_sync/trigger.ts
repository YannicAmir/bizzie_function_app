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
import { FmpChartService } from './services/fmp_chart_service';
import { FmpEodService } from './services/fmp_eod_service';
import { PreviousCloseResolver } from './previous_close';
import { StockPriceSyncUseCase } from './usecase';

getFirebaseAdmin();

const fmpApiKey = defineSecret('FMP_API_KEY');

const logger = new Logger(FEATURE_NAME);

const firestoreService = new FirestoreService();
const watchlistService = new FirebaseWatchlistService();

let fmpChartService: FmpChartService | undefined;
let fmpEodService: FmpEodService | undefined;

export const stockPriceSync = onSchedule({
    schedule: SCHEDULE,
    timeZone: TIMEZONE,
    memory: FUNCTION_MEMORY,
    timeoutSeconds: FUNCTION_TIMEOUT_SECONDS,
    maxInstances: FUNCTION_MAX_INSTANCES,
    secrets: [fmpApiKey],
}, async () => {

    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) {
        logger.error('Missing FMP_API_KEY');
        return;
    }

    fmpChartService ??= new FmpChartService(apiKey);
    fmpEodService ??= new FmpEodService(apiKey);

    const useCase = new StockPriceSyncUseCase(
        fmpChartService,
        new PreviousCloseResolver(fmpEodService),
        firestoreService,
        watchlistService,
    );

    try {
        await useCase.execute();
    } catch (error) {
        logger.error('Stock price sync run failed', error);
    }
});
