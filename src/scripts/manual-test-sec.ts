
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
import { Logger } from '../core/logger';
import { FirebaseWatchlistService } from '../core/services/watchlist_service';
import { FcmNotificationService } from '../core/services/notification_service';
import { FmpSecService } from '../features/sec_filings_notifier/services/sec_service';
import { FirebaseFilingHistoryService } from '../features/sec_filings_notifier/services/filing_history_service';
import { SecFilingsNotifierUseCase } from '../features/sec_filings_notifier/usecase';

const _logger = new Logger('Manual SEC Test');

async function run() {
    console.log("Starting Manual SEC Test...");
    try {
        const fmpKey = process.env.FMP_API_KEY;
        if (!fmpKey) throw new Error("FMP_API_KEY missing");

        // 1. Setup Services
        const watchlistService = new FirebaseWatchlistService();
        const notificationService = new FcmNotificationService();
        const secService = new FmpSecService(fmpKey);
        const filingHistoryService = new FirebaseFilingHistoryService();

        // 2. Direct Service Test (Verify API & Pagination)
        // Let's ask for a wide range for AAPL just to see strict data
        const today = new Date().toISOString().split('T')[0] || '';
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(new Date().getDate() - 90);
        const pastStr = thirtyDaysAgo.toISOString().split('T')[0] || '';

        _logger.info("--- 1. Testing SEC Service (Last 90 Days Sample) ---");
        // We can't filter by symbol in the API easily with this specific endpoint (it's by formType)
        // So we just rely on standard fetching
        const filings = await secService.getFilings('10-Q', pastStr, today);
        _logger.info(`Fetched ${filings.length} 10-Qs from ${pastStr} to ${today} globally.`);
        if (filings.length > 0) {
            _logger.info("First item sample:", filings[0]);
        }

        // 2.5 Seed Watchlist (Simulation)
        // If the user has no subscriptions, we can't test anything. Let's force one.
        // CNXA filed a 10-Q on 2025-12-23 (per logs).
        const knownTicker = 'CNXA';
        const watchlistRef = getFirebaseAdmin().firestore().collection('watchlist').doc(knownTicker);
        if (!(await watchlistRef.get()).exists) {
            _logger.info(`[Simulation] Seeding watchlist with ${knownTicker} for testing...`);
            await watchlistRef.set({ companyName: 'ConnectOne Bancorp (Test Seed)' });
        }

        // 3. Execution (The Real Logic: Yesterday -> Today)
        // SIMULATION: Let's pretend "Today" is a date we KNOW has filings.
        // Target: 2025-12-24. Because logic checks (Yesterday..Today], so (Dec 23..Dec 24].
        // This should catch the Dec 23rd filing.

        const simulateDate = new Date();
        // const simulateDate = new Date('2025-12-24T10:00:00Z'); // Time Travel Test

        _logger.info(`--- 2. Executing Use Case (Simulated Date: ${simulateDate.toISOString().split('T')[0]}) ---`);
        const useCase = new SecFilingsNotifierUseCase(
            watchlistService,
            secService,
            filingHistoryService,
            notificationService
        );

        await useCase.execute(simulateDate);

        _logger.info("Done!");
        process.exit(0);
    } catch (error) {
        _logger.error("Test Failed", error);
        process.exit(1);
    }
}

run();
