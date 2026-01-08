import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Logger } from '../../core/logger';
import { refreshDailyBrands } from './usecase';
import { ValidatedAIService } from './services/ai_service';
import { FirestoreService } from './services/firestore_service';
import { getRemoteConfig } from '../../core/remote-config';
import { getFirebaseAdmin } from '../../core/firebase';

getFirebaseAdmin();

const _logger = new Logger("Daily Brands Trigger");

export const dailyBrandsTrigger = onSchedule(
    {
        schedule: "every day 00:00",
        timeZone: "America/Los_Angeles",
        memory: "1GiB",
        timeoutSeconds: 540
    },
    async () => {
        _logger.info("Started");

        try {
            const config = await getRemoteConfig();
            _logger.info(`Using Model: ${config.gemini_model_name}, Sectors Count: ${config.sectors.length}`);

            const aiService = new ValidatedAIService();
            const dbService = new FirestoreService();

            await refreshDailyBrands(aiService, dbService, config.sectors);

            _logger.info("Completed successfully");
        } catch (error) {
            _logger.error("Failed", error);
        }
    }
);
