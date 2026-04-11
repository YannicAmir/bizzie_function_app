import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';
import { AppError } from '../../../core/errors';

const _logger = new Logger('BizzieChat AuthService');

export class AuthService {
    /**
     * Verify a Firebase ID token and return the decoded token.
     * Throws if the token is invalid, expired, or revoked.
     */
    async verifyIdToken(idToken: string): Promise<{ uid: string }> {
        try {
            const decoded = await getFirebaseAdmin().auth().verifyIdToken(idToken, true);
            return { uid: decoded.uid };
        } catch (error) {
            _logger.warn('ID token verification failed', { error: error instanceof Error ? error.message : String(error) });
            throw new AppError('Invalid or expired auth token', 'UNAUTHORIZED', 401);
        }
    }
}
