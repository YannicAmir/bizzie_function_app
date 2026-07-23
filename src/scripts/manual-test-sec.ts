
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
import { VertexAiService } from '../core/services/ai_service';
import { FmpSecService } from '../core/services/sec_service';
import { FirebaseFilingHistoryService } from '../core/services/filing_history_service';
import { FirebaseSecFilingsRepository } from '../core/services/sec_filings_repository';
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

        _logger.info("--- 1. Search for a recent 10-K (Last 90 Days) ---");
        // Get 10-Ks
        const filings = await secService.getFilings({ type: '10-K', startDate: pastStr, endDate: today });
        _logger.info(`Fetched ${filings.length} 10-Ks from ${pastStr} to ${today} globally.`);

        if (!filings || filings.length === 0 || !filings[0]) {
            _logger.error("No 10-K filings found in the last 90 days. Cannot verify.");
            process.exit(1);
        }

        const targetFiling = filings[0];
        _logger.info(`Targeting Filing: ${targetFiling.symbol} filed on ${targetFiling.filingDate}`);

        // 2.5 Seed Watchlist (Dynamic)
        const watchlistRef = getFirebaseAdmin().firestore().collection('watchlist').doc(targetFiling.symbol);
        _logger.info(`[Simulation] Seeding watchlist with ${targetFiling.symbol} for testing...`);
        await watchlistRef.set({ companyName: `${targetFiling.symbol} Test Corp` });

        // CLEAR HISTORY for this ticker
        const processedRef = getFirebaseAdmin().firestore().collection('processed_filings').where('symbol', '==', targetFiling.symbol);
        const processedDocs = await processedRef.get();
        if (!processedDocs.empty) {
            _logger.info(`[Simulation] Clearing ${processedDocs.size} processed records for ${targetFiling.symbol}...`);
            const batch = getFirebaseAdmin().firestore().batch();
            processedDocs.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }

        // 3. Execution 
        // We simulate "Today" as the day AFTER the filing was accepted, to ensure logic picks it up.
        // Filing acceptedDate is string "YYYY-MM-DD HH:mm:ss".
        // Filing logic looks for >= yesterday and <= today.

        // Let's set simulation date to filingDate + 1 day
        const filingDateObj = new Date(targetFiling.filingDate);
        const simulateDate = new Date(filingDateObj);
        simulateDate.setDate(simulateDate.getDate() + 1);

        _logger.info(`--- 2. Executing Use Case (Simulated Date: ${simulateDate.toISOString().split('T')[0]}) for ${targetFiling.symbol} ---`);
        const aiService = new VertexAiService(); // Mock or Real
        const secFilingsRepository = new FirebaseSecFilingsRepository();
        const useCase = new SecFilingsNotifierUseCase(
            watchlistService,
            secService,
            filingHistoryService,
            notificationService,
            aiService,
            secFilingsRepository
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
