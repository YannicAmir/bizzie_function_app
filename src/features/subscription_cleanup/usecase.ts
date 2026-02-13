import { Logger } from '../../core/logger';
import { FirestoreService } from '../../core/services/subscription/firestore_service';
import { RevenueCatService } from '../../core/services/subscription/revenuecat_service';

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
        _logger.info('Starting bidirectional subscription sync...');

        const metrics: CleanupMetrics = {
            totalScanned: 0,
            totalCorrected: 0,
            totalFailed: 0
        };

        try {
            const outOfSyncUsers = await this.firestoreService.getOutOfSyncSubscribers(50);
            metrics.totalScanned = outOfSyncUsers.length;

            if (outOfSyncUsers.length === 0) {
                _logger.info('No out-of-sync subscribers found.');
                return metrics;
            }

            _logger.info(`Found ${outOfSyncUsers.length} potential out-of-sync users. Starting verification...`);

            for (const user of outOfSyncUsers) {
                try {
                    const rcStatus = await this.revenueCatService.isUserSubscribed(user.id);
                    const needsCorrection = rcStatus.active !== user.isSubscribed;

                    if (needsCorrection) {
                        const action = rcStatus.active ? 'PROMOTING' : 'REVOKING';
                        _logger.info(`${action} user ${user.id}. RevenueCat: ${rcStatus.active}, Firestore: ${user.isSubscribed}`);

                        await this.firestoreService.updateSubscriptionStatus(
                            user.id,
                            rcStatus.active,
                            rcStatus.expiryDate || undefined
                        );
                        metrics.totalCorrected++;
                    } else {
                        _logger.debug(`User ${user.id} is already in sync.`);
                    }
                } catch (error) {
                    _logger.error(`Failed to verify/update user ${user.id}. Skipping.`, error);
                    metrics.totalFailed++;
                }
            }

            _logger.info('Subscription sync cycle complete.', metrics);
            return metrics;

        } catch (error) {
            _logger.error('Critical failure during subscription cleanup execution', error);
            throw error;
        }
    }
}
