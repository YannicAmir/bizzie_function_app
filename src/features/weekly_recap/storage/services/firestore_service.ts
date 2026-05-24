import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '../../../../core/firebase';
import { Logger } from '../../../../core/logger';
import { retry } from '../../../../core/retry';
import type { Company, LLMResponse } from '../models';

const logger = new Logger('WeeklyRecap/Storage/FirestoreService');

type WatchlistDocRaw = Readonly<{
  ticker?: unknown;
  companyName?: unknown;
}>;

const WATCHLIST_COLLECTION = 'watchlist';
const WEEKLY_RECAP_COLLECTION = 'weekly_recap';
const WEEKS_SUBCOLLECTION = 'weeks';

const FIRESTORE_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffFactor: 2,
};

export class FirestoreService {
  private get db(): FirebaseFirestore.Firestore {
    return getFirebaseAdmin().firestore();
  }

  async retrieveCompaniesFromDb(): Promise<Company[]> {
    try {
      const snapshot = await retry(
        () => this.db.collection(WATCHLIST_COLLECTION).get(),
        FIRESTORE_RETRY_OPTIONS,
      );
      const companies: Company[] = snapshot.docs.map((doc) => {
        const data = doc.data() as WatchlistDocRaw;
        return {
          ticker: String(data.ticker ?? ''),
          companyName: String(data.companyName ?? ''),
        };
      });
      logger.info(`Retrieved ${companies.length} companies from watchlist`);
      return companies;
    } catch (err) {
      logger.error('retrieveCompaniesFromDb failed', err);
      throw err;
    }
  }

  async storeSummaryInDb(response: LLMResponse): Promise<void> {
    const weekEndDate = response.time.slice(0, 10); // e.g. "2026-05-15"
    const docRef = this.db
      .collection(WEEKLY_RECAP_COLLECTION)
      .doc(response.ticker)
      .collection(WEEKS_SUBCOLLECTION)
      .doc(weekEndDate);

    const payload = {
      time: response.time,
      messageTitle: response.messageTitle,
      messageShortSummary: response.messageShortSummary,
      messageLongSummary: response.messageLongSummary,
      confidenceScore: response.confidenceScore,
      ticker: response.ticker,
      companyName: response.companyName,
      newArticleCount: response.newArticleCount,
      '8kCount': response.eightKCount,
      eodStockPriceCount: response.eodStockPriceCount,
      newsLinks: response.newsLinks,
      eightKLinks: response.eightKLinks,
      priceMovement: response.priceMovement,
      createdAt: FieldValue.serverTimestamp(),
    };

    try {
      await retry(() => docRef.set(payload), FIRESTORE_RETRY_OPTIONS);
      logger.info(`Stored summary for ${response.ticker} / ${weekEndDate}`);
    } catch (err) {
      logger.error(`storeSummaryInDb failed for ${response.ticker}`, err);
      throw err;
    }
  }
}
