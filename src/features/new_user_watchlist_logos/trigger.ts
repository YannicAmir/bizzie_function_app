import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { getFirebaseAdmin } from '../../core/firebase';
import { Logger } from '../../core/logger';
import {
    FUNCTION_MAX_INSTANCES,
    FUNCTION_MEMORY,
    FUNCTION_TIMEOUT_SECONDS,
    USERS_COLLECTION,
    WATCHLIST_SUBCOLLECTION,
} from './constants';
import { FmpProfileService } from './services/fmp_profile_service';
import { FirestoreService } from './services/firestore_service';
import { NewUserWatchlistLogosUseCase } from './usecase';

getFirebaseAdmin();

const fmpApiKey = defineSecret('FMP_API_KEY');

const _logger = new Logger('NewUserWatchlistLogos/Trigger');

const firestoreService = new FirestoreService();

interface WatchlistItemDoc {
    ticker?: string;
    logoUrl?: string;
}

function parseWatchlistItem(raw: unknown): WatchlistItemDoc {
    if (typeof raw !== 'object' || raw === null) {
        return {};
    }
    const record = raw as Record<string, unknown>;
    const item: WatchlistItemDoc = {};
    if (typeof record.ticker === 'string' && record.ticker.length > 0) {
        item.ticker = record.ticker;
    }
    if (typeof record.logoUrl === 'string' && record.logoUrl.length > 0) {
        item.logoUrl = record.logoUrl;
    }
    return item;
}

export const backfillNewUserWatchlistLogos = onDocumentCreated({
    document: `${USERS_COLLECTION}/{userId}/${WATCHLIST_SUBCOLLECTION}/{tickerId}`,
    memory: FUNCTION_MEMORY,
    timeoutSeconds: FUNCTION_TIMEOUT_SECONDS,
    maxInstances: FUNCTION_MAX_INSTANCES,
    secrets: [fmpApiKey],
}, async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        _logger.warn('No data associated with the watchlist item creation event');
        return;
    }

    const { userId, tickerId } = event.params;

    const apiKey = fmpApiKey.value();
    if (!apiKey) {
        _logger.error('Missing FMP_API_KEY');
        throw new Error('Missing FMP_API_KEY secret');
    }

    const item = parseWatchlistItem(snapshot.data());

    if (item.logoUrl) {
        _logger.info(`User ${userId}: ${tickerId} already has a logo, skipping.`);
        return;
    }

    try {
        const fmpProfileService = new FmpProfileService(apiKey);
        const useCase = new NewUserWatchlistLogosUseCase(fmpProfileService, firestoreService);
        await useCase.execute({
            userId,
            tickerId,
            ticker: item.ticker || tickerId,
        });
    } catch (error) {
        _logger.error(`Failed to backfill watchlist logo for user ${userId} ticker ${tickerId}`, error);
    }
});
