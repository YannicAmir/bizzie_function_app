import { onSchedule } from 'firebase-functions/v2/scheduler';
import { StockListSyncUseCase } from './usecase';
import { FmpService } from './services/fmp_service';
import { StorageService } from './services/storage_service';
import { Logger } from '../../core/logger';

import { getFirebaseAdmin } from '../../core/firebase';

getFirebaseAdmin();

const logger = new Logger('StockListSyncTrigger');

export const stockListSync = onSchedule({
    schedule: '0 9 * * *',
    timeZone: 'America/New_York',
    memory: '512MiB',
    timeoutSeconds: 300,
}, async () => {
    logger.info('Triggered stockListSync scheduled function');

    const fmpService = new FmpService();
    const storageService = new StorageService();
    const useCase = new StockListSyncUseCase(fmpService, storageService);

    try {
        await useCase.execute();
    } catch (error) {
        logger.error('Error in stockListSync', error instanceof Error ? error.message : String(error));
    }
});
