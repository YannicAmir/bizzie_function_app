import * as crypto from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';
import {
    GENERAL_MARKET_NEWS_COLLECTION,
    LEASE_DURATION_SECONDS,
    MS_PER_HOUR,
    MS_PER_SECOND,
    NEWS_TTL_HOURS,
    STATE_COLLECTION,
    STATE_DOC_ID,
} from '../constants';
import { GeneralNewsArticle } from '../models/GeneralNewsArticle';
import { easternWallTimeToEpochMs } from '../../../core/date_utils';

const _logger = new Logger('General Market News Firestore Service');

const GRPC_ALREADY_EXISTS = 6;
const ALREADY_EXISTS_STATUS = 'already-exists';

interface IngestionStateDoc {
    leaseExpiresAt?: Timestamp | undefined;
    lastRunAt?: Timestamp | undefined;
    lastPublishedDate?: string | undefined;
}

function asTimestamp(value: Timestamp | undefined): Timestamp | undefined {
    return typeof value?.toMillis === 'function' ? value : undefined;
}

function parseIngestionState(data: FirebaseFirestore.DocumentData | undefined): IngestionStateDoc {
    const raw = (data ?? {}) as IngestionStateDoc;
    return {
        leaseExpiresAt: asTimestamp(raw.leaseExpiresAt),
        lastRunAt: asTimestamp(raw.lastRunAt),
        lastPublishedDate: typeof raw.lastPublishedDate === 'string' ? raw.lastPublishedDate : undefined,
    };
}

export function computeNewsId(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex');
}

function isAlreadyExistsError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
        return false;
    }
    const code = (error as Record<string, unknown>).code;
    return code === GRPC_ALREADY_EXISTS || code === ALREADY_EXISTS_STATUS;
}

export class FirestoreService {

    private db(): FirebaseFirestore.Firestore {
        return getFirebaseAdmin().firestore();
    }

    private stateRef(): FirebaseFirestore.DocumentReference {
        return this.db().collection(STATE_COLLECTION).doc(STATE_DOC_ID);
    }

    async acquireLease(runIntervalSeconds: number): Promise<boolean> {
        const db = this.db();
        const ref = this.stateRef();

        return db.runTransaction(async (txn) => {
            const snapshot = await txn.get(ref);
            const now = Timestamp.now();

            const { leaseExpiresAt, lastRunAt } = parseIngestionState(snapshot.data());

            if (leaseExpiresAt && leaseExpiresAt.toMillis() > now.toMillis()) {
                return false;
            }
            if (lastRunAt && lastRunAt.toMillis() + runIntervalSeconds * MS_PER_SECOND > now.toMillis()) {
                return false;
            }

            txn.set(
                ref,
                {
                    leaseExpiresAt: Timestamp.fromMillis(now.toMillis() + LEASE_DURATION_SECONDS * MS_PER_SECOND),
                    lastRunAt: now,
                },
                { merge: true },
            );
            return true;
        });
    }

    async releaseLease(): Promise<void> {
        try {
            await this.stateRef().set({ leaseExpiresAt: Timestamp.now() }, { merge: true });
        } catch (error) {
            _logger.error('Failed to release lease (lease will self-expire).', error);
        }
    }

    async getCursor(): Promise<string | null> {
        const snapshot = await this.stateRef().get();
        return parseIngestionState(snapshot.data()).lastPublishedDate ?? null;
    }

    async advanceCursor(candidate: string): Promise<void> {
        const db = this.db();
        const ref = this.stateRef();

        await db.runTransaction(async (txn) => {
            const snapshot = await txn.get(ref);
            const current = parseIngestionState(snapshot.data()).lastPublishedDate ?? '';
            const next = candidate > current ? candidate : current;

            txn.set(ref, { lastPublishedDate: next }, { merge: true });
        });
    }

    async createNewsIfAbsent(article: GeneralNewsArticle): Promise<boolean> {
        const newsId = computeNewsId(article.url);
        const ref = this.db().collection(GENERAL_MARKET_NEWS_COLLECTION).doc(newsId);

        try {
            await ref.create({
                ...article,
                newsId,
                publishedAt: Timestamp.fromMillis(easternWallTimeToEpochMs(article.publishedDate)),
                createdAt: FieldValue.serverTimestamp(),
                expireAt: Timestamp.fromMillis(Date.now() + NEWS_TTL_HOURS * MS_PER_HOUR),
            });
            return true;
        } catch (error) {
            if (isAlreadyExistsError(error)) {
                _logger.debug(`Article already processed (overlap re-read): ${newsId}`, { newsId });
                return false;
            }
            _logger.error(`Failed to create general_market_news doc ${newsId}`, error);
            throw error;
        }
    }
}
