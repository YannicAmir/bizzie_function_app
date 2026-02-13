import * as dotenv from 'dotenv';
dotenv.config();

import { RevenueCatService } from '../core/services/subscription/revenuecat_service';
import { FirestoreService } from '../core/services/subscription/firestore_service';
import { SubscriptionCleanupUseCase } from '../features/subscription_cleanup/usecase';
import { getFirebaseAdmin } from '../core/firebase';


async function runTest() {
    process.env.GCLOUD_PROJECT = 'bizzie-dev-7199b';

    console.log('🚀 Starting Manual Cleanup Test...');

    getFirebaseAdmin();

    try {
        const firestoreService = new FirestoreService();
        const apiKey = process.env.RC_API_KEY || '';
        const revenueCatService = new RevenueCatService(apiKey);
        const useCase = new SubscriptionCleanupUseCase(firestoreService, revenueCatService);

        const metrics = await useCase.execute();

        console.log('✅ Cleanup finished successfully.');
        console.table(metrics);
    } catch (error) {
        console.error('❌ Cleanup failed:', error);
    }
}

runTest();
