import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Logger } from '../../core/logger';
const logger = new Logger("Daily Brands Trigger");
import { refreshDailyBrands } from './usecase';
import { ValidatedAIService } from './services/ai_service';
import { FirestoreService } from './services/firestore_service';
import { getRemoteConfig } from '../../core/remote-config';

export const dailyBrandsTrigger = onSchedule(
    {
        schedule: "every day 00:00",
        timeZone: "America/Los_Angeles", // Defaulting to PST as user is there
        memory: "1GiB", // Explicit memory for AI tasks
        timeoutSeconds: 300 // Explicit timeout for AI tasks
    },
    async (event) => {
        logger.info("Started");

        try {
            // Fetch configuration (cached)
            const config = await getRemoteConfig();
            logger.info(`Using Model: ${config.modelName}, Sectors Count: ${config.sectors.length}`);

            const aiService = new ValidatedAIService(config.modelName);
            const dbService = new FirestoreService();

            await refreshDailyBrands(aiService, dbService, config.sectors);

            logger.info("Completed successfully");
        } catch (error) {
            logger.error("Failed", error);
            // We don't rethrow here because it's a scheduled job, we just log the fail.
            // But depending on alerting needs, we might want to. 
            // For now, consistent with rules: catch top-level errors.
        }
    }
);
