import { Realtime8kNotifierUseCase } from '../features/realtime_8k_notifier/usecase';
import { FirebaseWatchlistService } from '../core/services/watchlist_service';
import { FcmNotificationService } from '../core/services/notification_service';
import { FmpSecService } from '../core/services/sec_service';
import { FirebaseFilingHistoryService } from '../core/services/filing_history_service';
import { VertexAiService } from '../core/services/ai_service';
import { getFirebaseAdmin } from '../core/firebase';
import { Logger } from '../core/logger';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load secrets locally (mirroring what Cloud Functions does)
dotenv.config({ path: path.resolve(process.cwd(), '.secret.local') });

const _logger = new Logger("Manual 8-K Test");

async function run() {
    try {
        _logger.info("--- Starting Manual 8-K Test ---");

        // 1. Check Env
        const apiKey = process.env.FMP_API_KEY;
        if (!apiKey) {
            throw new Error("Missing FMP_API_KEY in .secret.local");
        }

        // 2. Setup Services
        const watchlistService = new FirebaseWatchlistService();
        const secService = new FmpSecService(apiKey);
        const filingHistoryService = new FirebaseFilingHistoryService();
        const notificationService = new FcmNotificationService();
        const aiService = new VertexAiService();

        // 3. Seed Watchlist (Simulation)
        // We know from user data that 'APXT' had an 8-K on 2025-10-31.
        // Let's seed it to ensure we act on it.
        const testTicker = 'APXT';
        _logger.info(`[Simulation] Ensuring ${testTicker} is in watchlist...`);
        const watchlistRef = getFirebaseAdmin().firestore().collection('watchlist').doc(testTicker);
        await watchlistRef.set({ companyName: 'Apexigen (Test Seed)' });

        // 4. Clear Processed Filings (to ensure test runs even if previously processed)
        _logger.info(`[Simulation] Clearing previous processing history for ${testTicker}...`);
        const processedQuery = await getFirebaseAdmin().firestore().collection('processed_filings')
            .where('symbol', '==', testTicker).get();

        const deleteBatch = getFirebaseAdmin().firestore().batch();
        processedQuery.docs.forEach(doc => deleteBatch.delete(doc.ref));
        await deleteBatch.commit();
        _logger.info(`[Simulation] Cleared ${processedQuery.size} processed records.`);

        // 5. Execute Time Travel
        // We simulate running the cron job on Oct 31st, 2025.
        // FMP should return the 8-K.
        // AI should analyze it.
        const simulateDate = new Date('2025-10-31T12:00:00Z');

        _logger.info(`[Simulation] Time Travel to: ${simulateDate.toISOString()}`);

        const useCase = new Realtime8kNotifierUseCase(
            watchlistService,
            secService,
            filingHistoryService,
            notificationService,
            aiService
        );

        await useCase.execute(simulateDate);

        // 6. Verify Summary Content
        const filingsQuery = await getFirebaseAdmin().firestore().collection('sec_filings')
            .where('symbol', '==', testTicker)

            .get();

        if (!filingsQuery.empty) {
            const docs = filingsQuery.docs.map(d => d.data()).sort((a, b) => {

                return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
            });
            const doc = docs[0];
            if (doc) {
                _logger.info(`[VERIFICATION] Generated Summary: "${doc.summary}"`);
                _logger.info(`[VERIFICATION] Target Link: ${doc.link}`);
            }
        }

        _logger.info("Test Complete. Check logs above for 'Breaking News' or 'Earnings' detection.");

        // Clean exit
        process.exit(0);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
        _logger.error("Test Failed", e);
        console.error("FULL ERROR DEBUG:", JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
        if (e.response) {
            console.error("RESPONSE DATA:", JSON.stringify(e.response, null, 2));
        }
        process.exit(1);
    }
}

run();
