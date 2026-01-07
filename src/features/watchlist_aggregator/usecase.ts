import { GlobalWatchlistService } from './services/global_watchlist_service';
import { Logger } from '../../core/logger';

const logger = new Logger('WatchlistAggregatorUseCase');

export class WatchlistAggregatorUseCase {
    constructor(private globalWatchlistService: GlobalWatchlistService) { }

    async execute(ticker: string, companyName: string): Promise<void> {
        if (!ticker) {
            logger.warn('Attempted to aggregate watchlist item without ticker.');
            return;
        }

        logger.info(`Processing watchlist addition for ${ticker}`);

        await this.globalWatchlistService.upsertToGlobalList(ticker, companyName);
    }
}
