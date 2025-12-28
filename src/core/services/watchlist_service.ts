import { getFirebaseAdmin } from '../firebase';
import { Logger } from '../logger';

type GenericFirestoreDocument = FirebaseFirestore.QueryDocumentSnapshot;

export interface WatchlistService {
    getAllWatchedTickers(): Promise<Map<string, string>>;
}

const _logger = new Logger('Watchlist Service');

export class FirebaseWatchlistService implements WatchlistService {

    async getAllWatchedTickers(): Promise<Map<string, string>> {
        try {
            _logger.info('Fetching watched tickers from global watchlist...');

            const snapshot = await getFirebaseAdmin().firestore().collection('watchlist').get();

            const tickers = new Map<string, string>();

            if (snapshot.empty) {
                _logger.info('No watched tickers found.');
                return tickers;
            }

            snapshot.forEach((doc: GenericFirestoreDocument) => {
                // The document ID is the ticker symbol (e.g. "AAPL")
                const ticker = doc.id;
                const data = doc.data();
                const name = data.companyName || data.name || ticker; // Fallback to ticker if name missing
                tickers.set(ticker, name);
            });

            _logger.info(`Found ${tickers.size} distinct watched tickers.`);
            return tickers;
        } catch (error) {
            _logger.error('Failed to fetch watchlist', error);
            throw error;
        }
    }
}
