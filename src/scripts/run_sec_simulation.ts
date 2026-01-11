
import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';

// Load Environment Variables (and Manual Overrides) BEFORE importing src modules
dotenv.config();

// FORCE PROJECT ID so ConfigService & VertexAI see it immediately upon import
if (!process.env.GCLOUD_PROJECT) {
    process.env.GCLOUD_PROJECT = 'bizzie-dev-7199b';
}
process.env.PROJECT_ID = process.env.GCLOUD_PROJECT; // Redundancy for config.ts
process.env.LOCATION = 'us-central1'; // Default location

// NOW import application code
import { Logger } from '../core/logger';
import { SecService, SecFiling } from "../core/services/sec_service";
import { SecFilingsNotifierUseCase } from "../features/sec_filings_notifier/usecase";
import { Realtime8kNotifierUseCase } from "../features/realtime_8k_notifier/usecase";
import { FirebaseWatchlistService } from "../core/services/watchlist_service";
import { FcmNotificationService } from "../core/services/notification_service";
import { FirebaseFilingHistoryService } from "../core/services/filing_history_service";
import { VertexAiService } from "../core/services/ai_service";

// Initialize Firebase Admin (Uses Default Credentials)
if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: process.env.GCLOUD_PROJECT
    });
}

const logger = new Logger('SEC-Simulator-Script');

// --- MOCK DATA ---
const MOCK_DATA: SecFiling[] = [
    {
        symbol: "NVDA",
        cik: "0001045810",
        filingDate: "2026-01-11 00:00:00",
        acceptedDate: "2026-01-11 17:56:38",
        formType: "10-K",
        link: "https://www.sec.gov/Archives/edgar/data/1045810/000104581025000023/0001045810-25-000023-index.htm",
        finalLink: "https://www.sec.gov/Archives/edgar/data/1045810/000104581025000023/nvda-20250126.htm"
    },
    {
        symbol: "NVDA",
        cik: "0001045810",
        filingDate: "2026-01-11 00:00:00",
        acceptedDate: "2026-01-11 17:56:38",
        formType: "10-Q",
        link: "https://www.sec.gov/Archives/edgar/data/1045810/000104581025000230/0001045810-25-000230-index.htm",
        finalLink: "https://www.sec.gov/Archives/edgar/data/1045810/000104581025000230/nvda-20251026.htm"
    },
    {
        symbol: "NVDA",
        cik: "0001045810",
        filingDate: "2026-01-11 00:00:00",
        acceptedDate: "2026-01-11 17:56:38",
        formType: "8-K",
        link: "https://www.sec.gov/Archives/edgar/data/1045810/000104581025000228/0001045810-25-000228-index.htm",
        finalLink: "https://www.sec.gov/Archives/edgar/data/1045810/000104581025000228/q3fy26pr.htm"
    }
];

/**
 * MOCK SEC SERVICE
 */
class MockSecService implements SecService {
    constructor(private mockFilings: SecFiling[]) { }

    async getFilings(type: '10-K' | '10-Q' | '8-K', startDate: string, endDate: string): Promise<SecFiling[]> {
        logger.info(`[MockSecService] Returning mock data for type: ${type}`);
        return this.mockFilings.filter(f => f.formType === type);
    }

    async getFilingText(url: string): Promise<string> {
        logger.info(`[MockSecService] Fetching REAL text from: ${url}`);
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'BizzieApp/1.0 (simulator@getbizzie.io)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });
            if (!response.ok) return "";
            const rawText = await response.text();
            const stripped = rawText.replace(/<[^>]*>?/gm, ' ');
            return stripped.substring(0, 1500000);
        } catch (e) {
            console.error("[MockSecService] Fetch failed", e);
            return "";
        }
    }
}

async function runSimulation() {
    logger.info("Initializing Services...");

    // 1. Dependency Injection
    const watchlistService = new FirebaseWatchlistService();
    const filingHistoryService = new FirebaseFilingHistoryService();
    const notificationService = new FcmNotificationService();
    const aiService = new VertexAiService();

    // 2. Inject Mock Service
    const mockSecService = new MockSecService(MOCK_DATA);

    // 3. Run 10-K/10-Q Use Case
    logger.info("--- Running 10-K / 10-Q Simulation ---");
    const reportUseCase = new SecFilingsNotifierUseCase(
        watchlistService,
        mockSecService,
        filingHistoryService,
        notificationService,
        aiService
    );
    await reportUseCase.execute(new Date());

    // 4. Run 8-K Use Case
    logger.info("--- Running 8-K Simulation ---");
    const realTimeUseCase = new Realtime8kNotifierUseCase(
        watchlistService,
        mockSecService,
        filingHistoryService,
        notificationService,
        aiService
    );
    await realTimeUseCase.execute(new Date());

    logger.info("Simulation Complete. Check Firestore (sec_filings & financial_reports) for results.");
}

runSimulation().catch(console.error);
