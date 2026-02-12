import { Logger } from '../../core/logger';
import { FirestoreService } from './services/firestore_service';
import { RevenueCatService } from './services/revenuecat_service';

const _logger = new Logger('Subscription Cleanup UseCase');

interface CleanupMetrics {
    totalScanned: number;
    totalCorrected: number;
    totalFailed: number;
}

export class SubscriptionCleanupUseCase {
    constructor(
        private firestoreService: FirestoreService,
        private revenueCatService: RevenueCatService
    ) { }

    async execute(): Promise<CleanupMetrics> {
        _logger.info('Starting subscription cleanup cycle...');

        const metrics: CleanupMetrics = {
            totalScanned: 0,
            totalCorrected: 0,
            totalFailed: 0
        };

        try {
            const ghosts = await this.firestoreService.getGhostSubscribers(50);
            metrics.totalScanned = ghosts.length;

            if (ghosts.length === 0) {
                _logger.info('No ghost subscribers found to clean up.');
                return metrics;
            }

            _logger.info(`Found ${ghosts.length} potential ghost subscribers. Starting verification...`);

            for (const ghost of ghosts) {
                try {
                    const isActuallySubscribed = await this.revenueCatService.isUserSubscribed(ghost.id);

                    if (!isActuallySubscribed) {
                        _logger.info(`User ${ghost.id} is confirmed as EXPIRED in RevenueCat. Syncing Firestore...`);
                        await this.firestoreService.updateSubscriptionStatus(ghost.id, false);
                        metrics.totalCorrected++;
                    } else {
                        _logger.info(`User ${ghost.id} is still active in RevenueCat (likely a late renewal). Access remains.`);
                    }
                } catch (error) {
                    _logger.error(`Failed to verify/update ghost user ${ghost.id}. Skipping to next.`, error);
                    metrics.totalFailed++;
                }
            }

            _logger.info('Subscription cleanup cycle complete.', metrics);
            return metrics;

        } catch (error) {
            _logger.error('Critical failure during subscription cleanup execution', error);
            throw error;
        }
    }
}
