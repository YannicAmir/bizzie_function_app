import { DBService, DailyBrandsData } from '../usecase';
import { getFirebaseAdmin } from '../../../core/firebase';

export class FirestoreService implements DBService {
    private db = getFirebaseAdmin().firestore();

    async setDailyContent(data: DailyBrandsData): Promise<void> {
        await this.db.collection('daily_brands').doc('content').set(data);
    }
}
