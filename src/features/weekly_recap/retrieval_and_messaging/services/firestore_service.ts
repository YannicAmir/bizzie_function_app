import { getFirebaseAdmin } from '../../../../core/firebase';
import { Logger } from '../../../../core/logger';
import { retry } from '../../../../core/retry';
import type { UserRecord, WeeklySummary } from '../models';
import { TRANSIENT_GRPC_CODES } from '../constants/grpc';

const logger = new Logger('WeeklyRecap/Retrieval/FirestoreService');

const db = getFirebaseAdmin().firestore();

const FIRESTORE_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffFactor: 2,
  shouldRetry: (err: unknown): boolean => {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? Number((err as Record<string, unknown>).code)
        : -1;
    return TRANSIENT_GRPC_CODES.includes(code);
  },
};

const USERS_COLLECTION = 'users';
const WATCHLIST_SUBCOLLECTION = 'watchlist';
const WEEKS_SUBCOLLECTION = 'weeks';
const DAY_START_SUFFIX = 'T00:00:00.000Z';

type UserProfileRaw = Readonly<{
  fcmTokens?: unknown;
  notificationsEnabled?: unknown;
}>;

type WeeklySummaryRaw = Readonly<{
  ticker?: unknown;
  companyName?: unknown;
  messageTitle?: unknown;
  messageShortSummary?: unknown;
}>;

export class FirestoreService {
  async retrieveEligibleUsers(): Promise<UserRecord[]> {
    let snapshot: FirebaseFirestore.QuerySnapshot;
    try {
      snapshot = await retry(
        () => db
          .collection(USERS_COLLECTION)
          .where('notificationsEnabled', '==', true)
          .get(),
        FIRESTORE_RETRY_OPTIONS,
      );
    } catch (err) {
      logger.error('retrieveSubscribedUsers: Firestore query failed', err);
      throw err;
    }

    const watchlistResults = await Promise.allSettled(
      snapshot.docs.map((doc) => this.buildUserRecord(doc)),
    );

    const users: UserRecord[] = [];
    for (const result of watchlistResults) {
      if (result.status === 'fulfilled') {
        users.push(result.value);
      }
    }

    logger.info(`Fetched ${snapshot.size} users from Firestore (${users.length} eligible)`, {
      total: snapshot.size,
      eligible: users.length,
    });

    return users;
  }

  async retrieveSummariesForWeek(weekEndDate: string): Promise<WeeklySummary[]> {
    const d = new Date(`${weekEndDate}${DAY_START_SUFFIX}`);
    d.setUTCDate(d.getUTCDate() + 1);
    const nextDay = d.toISOString().slice(0, 10);

    let snapshot: FirebaseFirestore.QuerySnapshot;
    try {
      snapshot = await retry(
        () => db
          .collectionGroup(WEEKS_SUBCOLLECTION)
          .where('time', '>=', `${weekEndDate}${DAY_START_SUFFIX}`)
          .where('time', '<', `${nextDay}${DAY_START_SUFFIX}`)
          .get(),
        FIRESTORE_RETRY_OPTIONS,
      );
    } catch (err) {
      logger.error(`retrieveSummariesForWeek: collection group query failed for ${weekEndDate}`, err);
      throw err;
    }

    const summaries: WeeklySummary[] = [];
    for (const doc of snapshot.docs) {
      const summary = this.parseWeeklySummaryDoc(doc, weekEndDate);
      if (summary) summaries.push(summary);
    }

    logger.info(`Retrieved ${summaries.length} summaries for week ${weekEndDate}`, {
      count: summaries.length,
      weekEndDate,
    });
    return summaries;
  }

  private async buildUserRecord(
    doc: FirebaseFirestore.QueryDocumentSnapshot,
  ): Promise<UserRecord> {
    const uid = doc.id;
    const data = doc.data() as UserProfileRaw;

    let watchlistSnapshot: FirebaseFirestore.QuerySnapshot;
    try {
      watchlistSnapshot = await retry(
        () => db
          .collection(USERS_COLLECTION)
          .doc(uid)
          .collection(WATCHLIST_SUBCOLLECTION)
          .get(),
        FIRESTORE_RETRY_OPTIONS,
      );
    } catch (err) {
      logger.warn(`Watchlist read failed for uid ${uid} — user excluded from delivery`, { uid, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }

    const tickers = watchlistSnapshot.docs.map((d) => d.id);
    logger.debug(`Fetched ${tickers.length} tickers for user ${uid}`, { uid, count: tickers.length });

    const rawFcmTokens = data.fcmTokens;
    const fcmTokens =
      typeof rawFcmTokens === 'object' && rawFcmTokens !== null && !Array.isArray(rawFcmTokens)
        ? [
            ...new Set(
              Object.values(rawFcmTokens as Record<string, unknown>)
                .filter((v): v is string => typeof v === 'string'),
            ),
          ]
        : [];

    return { uid, fcmTokens, tickers } satisfies UserRecord;
  }

  private parseWeeklySummaryDoc(
    doc: FirebaseFirestore.QueryDocumentSnapshot,
    weekEndDate: string,
  ): WeeklySummary | null {
    const raw = doc.data() as WeeklySummaryRaw;
    const ticker = typeof raw.ticker === 'string' ? raw.ticker : '';
    if (!ticker) {
      logger.warn(`Missing ticker field in weekly_recap doc`, { path: doc.ref.path });
      return null;
    }

    const companyName = typeof raw.companyName === 'string' ? raw.companyName : '';
    const messageTitle = typeof raw.messageTitle === 'string' ? raw.messageTitle : '';
    const messageShortSummary = typeof raw.messageShortSummary === 'string' ? raw.messageShortSummary : '';

    if (!companyName || !messageTitle || !messageShortSummary) {
      logger.warn('Incomplete weekly_recap doc — skipped', { path: doc.ref.path, ticker });
      return null;
    }

    logger.debug(`Found summary for ${ticker} / ${weekEndDate}`, { ticker, weekEndDate });
    return { ticker, companyName, weekEndDate, messageTitle, messageShortSummary };
  }
}
