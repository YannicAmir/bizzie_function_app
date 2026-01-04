import { FmpService } from './services/fmp_service';
import { StorageService, StockEntry } from './services/storage_service';
import { Logger } from '../../core/logger';

const logger = new Logger('StockListSyncUseCase');

export class StockListSyncUseCase {
    constructor(
        private fmpService: FmpService,
        private storageService: StorageService
    ) { }

    async execute(): Promise<void> {
        logger.info('Starting stock list sync...');

        // 1. Fetch
        const rawStocks = await this.fmpService.fetchAllStocks();

        // 2. Transform / Minify
        const minifiedStocks: StockEntry[] = rawStocks.map(stock => ({
            s: stock.symbol,
            n: stock.companyName
        }));

        logger.info(`Minified ${minifiedStocks.length} stocks.`);

        // 3. Save
        await this.storageService.saveStockList(minifiedStocks);

        logger.info('Stock list sync completed successfully.');
    }
}
