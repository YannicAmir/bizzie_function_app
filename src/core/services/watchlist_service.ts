import { getFirebaseAdmin } from '../firebase';
import { Logger } from '../logger';

type GenericFirestoreDocument = FirebaseFirestore.QueryDocumentSnapshot;

export interface WatchlistService {
    getAllWatchedTickers(cacheTtlSeconds?: number): Promise<Map<string, string>>;
}

const _logger = new Logger('Watchlist Service');

export class FirebaseWatchlistService implements WatchlistService {

    private cachedTickers: Map<string, string> | null = null;
    private cachedAtMs = 0;

    async getAllWatchedTickers(cacheTtlSeconds = 0): Promise<Map<string, string>> {
        const now = Date.now();
        if (this.cachedTickers && now - this.cachedAtMs < cacheTtlSeconds * 1000) {
            return this.cachedTickers;
        }

        try {
            _logger.info('Fetching watched tickers from global watchlist...');

            const snapshot = await getFirebaseAdmin().firestore().collection('watchlist').get();

            const tickers = new Map<string, string>();

            if (snapshot.empty) {
                _logger.info('No watched tickers found.');
            } else {
                snapshot.forEach((doc: GenericFirestoreDocument) => {
                    const ticker = doc.id;
                    const data = doc.data();
                    const name = data.companyName || data.name || ticker;
                    tickers.set(ticker, name);
                });
                _logger.info(`Found ${tickers.size} distinct watched tickers.`);
            }

            this.cachedTickers = tickers;
            this.cachedAtMs = now;
            return tickers;
        } catch (error) {
            _logger.error('Failed to fetch watchlist', error);
            throw error;
        }
    }
}
