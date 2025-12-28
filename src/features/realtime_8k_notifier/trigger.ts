import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FirebaseWatchlistService } from '../../core/services/watchlist_service';
import { FcmNotificationService } from '../../core/services/notification_service';
import { FmpSecService } from '../../core/services/sec_service';
import { FirebaseFilingHistoryService } from '../../core/services/filing_history_service';
import { VertexAiService } from '../../core/services/ai_service';
import { Realtime8kNotifierUseCase } from './usecase';


// Determine Environment


// Schedule: Every 15 minutes, 6 AM to 10 PM, Mon-Fri (Market Hours+)
// Cron: */15 6-22 * * 1-5
export const realtime8kNotifier = onSchedule({
    schedule: '*/15 6-22 * * 1-5',
    timeZone: 'America/New_York',
    memory: '1GiB', // Needs memory for AI parsing if text is large
    timeoutSeconds: 540, // 9 minutes max
    secrets: ["FMP_API_KEY"]
}, async () => {

    // Check if secret exists (runtime)
    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) {
        console.error("Missing FMP_API_KEY");
        return;
    }

    const useCase = new Realtime8kNotifierUseCase(
        new FirebaseWatchlistService(),
        new FmpSecService(apiKey),
        new FirebaseFilingHistoryService(),
        new FcmNotificationService(),
        new VertexAiService()
    );

    await useCase.execute();
});
