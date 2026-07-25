import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';
import {
    GLOBAL_WATCHLIST_COLLECTION,
    USERS_COLLECTION,
    WATCHLIST_SUBCOLLECTION,
} from '../constants';

const _logger = new Logger('NewUserWatchlistLogos/FirestoreService');

export class FirestoreService {
    async getCachedLogoUrl(ticker: string): Promise<string | null> {
        const snapshot = await this.globalWatchlistDoc(ticker).get();
        const logoUrl: unknown = snapshot.get('logoUrl');
        return typeof logoUrl === 'string' && logoUrl.length > 0 ? logoUrl : null;
    }

    async setLogoUrl(userId: string, docId: string, logoUrl: string): Promise<void> {
        const ref = getFirebaseAdmin()
            .firestore()
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection(WATCHLIST_SUBCOLLECTION)
            .doc(docId);
        try {
            await ref.update({ logoUrl });
        } catch (error) {
            _logger.error(`Failed to set logoUrl on ${ref.path}`, error);
            throw error;
        }
    }

    async cacheLogoUrl(ticker: string, logoUrl: string): Promise<boolean> {
        const ref = this.globalWatchlistDoc(ticker);
        try {
            await ref.set({ logoUrl }, { merge: true });
            return true;
        } catch (error) {
            _logger.error(`Failed to cache logoUrl for ${ticker} on global watchlist`, error);
            return false;
        }
    }

    private globalWatchlistDoc(ticker: string): FirebaseFirestore.DocumentReference {
        return getFirebaseAdmin()
            .firestore()
            .collection(GLOBAL_WATCHLIST_COLLECTION)
            .doc(ticker);
    }
}
