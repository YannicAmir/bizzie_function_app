import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load secrets manually for local execution
const secretPath = path.resolve(__dirname, '../../.secret.local');
if (fs.existsSync(secretPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(secretPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

import { getFirebaseAdmin } from '../core/firebase';
import { EarningsNotifierUseCase } from '../features/earnings_notifier/usecase';
import { FirebaseWatchlistService } from '../core/services/watchlist_service';
import { FmpMarketDataService } from '../features/earnings_notifier/services/market_data_service';
import { FirestoreEarningsStorageService } from '../features/earnings_notifier/services/earnings_storage_service';
import { FcmNotificationService } from '../core/services/notification_service';
import { Logger } from '../core/logger'; // Using the public wrapper

const _logger = new Logger('Manual Test Script');

async function run() {
    try {
        const db = getFirebaseAdmin().firestore();

        // 1. Inspect Watchlist (Read-Only)
        _logger.info("Inspecting Firestore Watchlist...");
        const watchlistRef = db.collection('watchlist');
        const snapshot = await watchlistRef.get();

        if (snapshot.empty) {
            _logger.warn("⚠️ Watchlist is empty!");
        } else {
            const tickers = snapshot.docs.map(d => d.id);
            _logger.info(`Found ${snapshot.size} tickers in watchlist: ${JSON.stringify(tickers)}`);
        }

        // 2. Setup Dependencies
        const fmpKey = process.env.FMP_API_KEY;
        if (!fmpKey) {
            throw new Error("FMP_API_KEY not found in process.env");
        }

        // Calculate dates dynamically to match UseCase logic
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);
        const fromStr = today.toISOString().substring(0, 10);
        const toStr = nextWeek.toISOString().substring(0, 10);

        _logger.info(`DEBUG: Date Range: ${fromStr} to ${toStr}`);

        // DEBUG: Raw API Test (stable)
        const stableUrl = `https://financialmodelingprep.com/stable/earnings-calendar?from=${fromStr}&to=${toStr}&apikey=${fmpKey}`;
        try {
            _logger.info("DEBUG: Fetching from FMP 'stable' endpoint...");
            const res = await fetch(stableUrl);
            const data = await res.json();
            if (Array.isArray(data)) {
                _logger.info(`DEBUG: stable API returned ${data.length} events.`);
            } else {
                _logger.error("DEBUG: stable API response error:", data);
            }
        } catch (e) {
            _logger.error("DEBUG: stable fetch failed", e);
        }

        const watchlistService = new FirebaseWatchlistService();
        const marketDataService = new FmpMarketDataService(fmpKey);
        const notificationService = new FcmNotificationService();
        const earningsStorageService = new FirestoreEarningsStorageService();

        // 3. Instantiate Use Case
        const useCase = new EarningsNotifierUseCase(
            watchlistService,
            marketDataService,
            notificationService,
            earningsStorageService
        );

        // 4. Execute
        _logger.info("Executing Earnings Notifier Use Case...");
        await useCase.execute();

        _logger.info("Done!");
        process.exit(0);
    } catch (error) {
        _logger.error("Test Failed", error);
        process.exit(1);
    }
}

run();
