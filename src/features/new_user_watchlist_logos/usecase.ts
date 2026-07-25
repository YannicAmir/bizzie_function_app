import { Logger } from '../../core/logger';
import { FmpProfileService } from './services/fmp_profile_service';
import { FirestoreService } from './services/firestore_service';

const _logger = new Logger('NewUserWatchlistLogos/UseCase');

export interface WatchlistLogoBackfillRequest {
    userId: string;
    tickerId: string;
    ticker: string;
}

export class NewUserWatchlistLogosUseCase {
    constructor(
        private readonly fmpProfileService: FmpProfileService,
        private readonly firestoreService: FirestoreService,
    ) { }

    async execute(request: WatchlistLogoBackfillRequest): Promise<void> {
        const { userId, tickerId, ticker } = request;

        const cachedLogoUrl = await this.firestoreService.getCachedLogoUrl(ticker);
        if (cachedLogoUrl) {
            await this.firestoreService.setLogoUrl(userId, tickerId, cachedLogoUrl);
            _logger.info(`User ${userId}: reused cached logo for ${ticker}, no FMP call.`);
            return;
        }

        const logoUrl = await this.fmpProfileService.fetchLogoUrl(ticker);
        if (!logoUrl) {
            _logger.info(`User ${userId}: no FMP image for ${ticker}, nothing to backfill.`);
            return;
        }

        await this.firestoreService.setLogoUrl(userId, tickerId, logoUrl);
        const cached = await this.firestoreService.cacheLogoUrl(ticker, logoUrl);
        _logger.info(
            cached
                ? `User ${userId}: fetched and cached logo for ${ticker}.`
                : `User ${userId}: fetched logo for ${ticker} (global cache write failed).`,
        );
    }
}
