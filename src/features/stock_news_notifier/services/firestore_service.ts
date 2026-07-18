import * as crypto from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';
import {
    COOLDOWNS_COLLECTION,
    LEASE_DURATION_SECONDS,
    MS_PER_HOUR,
    MS_PER_SECOND,
    NEWS_TTL_HOURS,
    STATE_COLLECTION,
    STATE_DOC_ID,
    STOCK_NEWS_COLLECTION,
} from '../constants';
import { StockNewsArticle } from '../models/StockNewsArticle';
import { easternWallTimeToEpochMs } from './date_utils';

const _logger = new Logger('Stock News Firestore Service');

const GRPC_ALREADY_EXISTS = 6;

interface IngestionStateDoc {
    leaseExpiresAt?: Timestamp | undefined;
    lastPublishedDate?: string | undefined;
}

interface CooldownDoc {
    lastNotifiedAt?: Timestamp | undefined;
}

function asTimestamp(value: Timestamp | undefined): Timestamp | undefined {
    return typeof value?.toMillis === 'function' ? value : undefined;
}

function parseIngestionState(data: FirebaseFirestore.DocumentData | undefined): IngestionStateDoc {
    const raw = (data ?? {}) as IngestionStateDoc;
    return {
        leaseExpiresAt: asTimestamp(raw.leaseExpiresAt),
        lastPublishedDate: typeof raw.lastPublishedDate === 'string' ? raw.lastPublishedDate : undefined,
    };
}

function parseCooldown(data: FirebaseFirestore.DocumentData | undefined): CooldownDoc {
    const raw = (data ?? {}) as CooldownDoc;
    return {
        lastNotifiedAt: asTimestamp(raw.lastNotifiedAt),
    };
}

export function computeNewsId(symbol: string, url: string): string {
    return crypto.createHash('sha256').update(`${symbol}|${url}`).digest('hex');
}

function isAlreadyExistsError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
        return false;
    }
    const code = (error as Record<string, unknown>).code;
    return code === GRPC_ALREADY_EXISTS || code === 'already-exists';
}

export class FirestoreService {

    private stateRef(): FirebaseFirestore.DocumentReference {
        return getFirebaseAdmin().firestore().collection(STATE_COLLECTION).doc(STATE_DOC_ID);
    }

    async acquireLease(): Promise<boolean> {
        const db = getFirebaseAdmin().firestore();
        const ref = this.stateRef();

        return db.runTransaction(async (txn) => {
            const snapshot = await txn.get(ref);
            const now = Timestamp.now();

            const { leaseExpiresAt } = parseIngestionState(snapshot.data());

            if (leaseExpiresAt && leaseExpiresAt.toMillis() > now.toMillis()) {
                return false;
            }

            txn.set(
                ref,
                { leaseExpiresAt: Timestamp.fromMillis(now.toMillis() + LEASE_DURATION_SECONDS * MS_PER_SECOND) },
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
        const db = getFirebaseAdmin().firestore();
        const ref = this.stateRef();

        await db.runTransaction(async (txn) => {
            const snapshot = await txn.get(ref);
            const current = parseIngestionState(snapshot.data()).lastPublishedDate ?? '';
            const next = candidate > current ? candidate : current;

            txn.set(
                ref,
                { lastPublishedDate: next, updatedAt: FieldValue.serverTimestamp() },
                { merge: true },
            );
        });
    }

    async createNewsIfAbsent(article: StockNewsArticle): Promise<boolean> {
        const newsId = computeNewsId(article.symbol, article.url);
        const ref = getFirebaseAdmin().firestore().collection(STOCK_NEWS_COLLECTION).doc(newsId);

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
                _logger.debug(`Article already processed (overlap re-read): ${newsId}`, {
                    newsId,
                    symbol: article.symbol,
                });
                return false;
            }
            _logger.error(`Failed to create stock_news doc ${newsId} for ${article.symbol}`, error);
            throw error;
        }
    }

    async claimNotificationSlot(ticker: string, cooldownSeconds: number): Promise<boolean> {
        const db = getFirebaseAdmin().firestore();
        const ref = db.collection(COOLDOWNS_COLLECTION).doc(ticker);

        try {
            return await db.runTransaction(async (txn) => {
                const snapshot = await txn.get(ref);
                const now = Timestamp.now();

                const { lastNotifiedAt } = parseCooldown(snapshot.data());

                if (lastNotifiedAt && lastNotifiedAt.toMillis() + cooldownSeconds * MS_PER_SECOND > now.toMillis()) {
                    return false;
                }

                txn.set(ref, { ticker, lastNotifiedAt: now }, { merge: true });
                return true;
            });
        } catch (error) {
            _logger.error(`Failed to claim notification slot for ${ticker} — failing closed.`, error);
            return false;
        }
    }
}
