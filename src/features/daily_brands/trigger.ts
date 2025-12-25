import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { refreshDailyBrands } from './usecase';
import { ValidatedAIService } from './services/ai_service';
import { FirestoreService } from './services/firestore_service';

export const dailyBrandsTrigger = onSchedule(
    {
        schedule: "every day 00:00",
        timeZone: "America/Los_Angeles", // Defaulting to PST as user is there
        memory: "1GiB", // Explicit memory for AI tasks
        timeoutSeconds: 300 // Explicit timeout for AI tasks
    },
    async (event) => {
        logger.info("Daily Brands Trigger started");

        try {
            const aiService = new ValidatedAIService();
            const dbService = new FirestoreService();

            await refreshDailyBrands(aiService, dbService);

            logger.info("Daily Brands Trigger completed successfully");
        } catch (error) {
            logger.error("Daily Brands Trigger failed", error);
            // We don't rethrow here because it's a scheduled job, we just log the fail.
            // But depending on alerting needs, we might want to. 
            // For now, consistent with rules: catch top-level errors.
        }
    }
);
