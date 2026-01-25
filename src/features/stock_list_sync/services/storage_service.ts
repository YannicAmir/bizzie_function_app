import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';

const logger = new Logger('StorageService');

export interface StockEntry {
    s: string; // symbol
    n: string; // name
}

interface StockListDocument {
    updatedAt: string;
    stocks: StockEntry[];
}

export class StorageService {
    private bucket = getFirebaseAdmin().storage().bucket();
    private initialized = false;

    async saveStockList(stocks: StockEntry[]): Promise<void> {
        if (!this.initialized) {
            logger.info(`StorageService initialized with bucket: ${this.bucket.name}`);
            this.initialized = true;
        }
        const file = this.bucket.file('system_data/stock_list.json');

        const payload: StockListDocument = {
            updatedAt: new Date().toISOString(),
            stocks
        };

        const jsonString = JSON.stringify(payload);

        await file.save(jsonString, {
            gzip: true,
            contentType: 'application/json',
            metadata: {
                cacheControl: 'public, max-age=3600',
            }
        });

        logger.info(`Uploaded ${stocks.length} stocks to Cloud Storage system_data/stock_list.json`);
    }
}
