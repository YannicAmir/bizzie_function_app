import { Logger } from '../../core/logger';
import { FirestoreService } from '../../core/services/subscription/firestore_service';
import { RevenueCatService } from '../../core/services/subscription/revenuecat_service';

const _logger = new Logger('Manual Subscription Sync UseCase');

export interface SyncResult {
    active: boolean;
    expiryDate: string | null;
}

export class ManualSyncUseCase {
    constructor(
        private readonly firestoreService: FirestoreService,
        private readonly revenueCatService: RevenueCatService
    ) { }

    async execute(userId: string): Promise<SyncResult> {
        try {
            _logger.info(`Starting manual sync for user ${userId}`);

            const rcStatus = await this.revenueCatService.isUserSubscribed(userId);

            await this.firestoreService.updateSubscriptionStatus(
                userId,
                rcStatus.active,
                rcStatus.expiryDate || undefined
            );

            _logger.info(`Manual sync complete for ${userId}. New status: ${rcStatus.active}`);

            return {
                active: rcStatus.active,
                expiryDate: rcStatus.expiryDate
            };
        } catch (error) {
            _logger.error(`Manual sync failed for user ${userId}`, error);
            throw error;
        }
    }
}
