import { getFirebaseAdmin } from '../../../../core/firebase';
import { Logger } from '../../../../core/logger';
import { retry } from '../../../../core/retry';
import type { EligibleUser, WeeklySummary } from '../models';

const logger = new Logger('WeeklyRecap/Retrieval/FcmService');

const messaging = getFirebaseAdmin().messaging();

const CHUNK_SIZE = 500;
const TOKEN_LOG_PREFIX_LENGTH = 20;

const FCM_RETRY_OPTIONS = {
  maxAttempts: 2,
  initialDelayMs: 1000,
  backoffFactor: 2,
  shouldRetry: (err: unknown): boolean => {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as Record<string, unknown>).code)
        : undefined;
    if (!code) return true;
    return !code.includes('registration-token') && !code.includes('invalid-argument');
  },
};

interface TokenOwner {
  uid: string;
  token: string;
}

export class FcmService {
  async sendNotifications(users: EligibleUser[], summary: WeeklySummary): Promise<void> {
    try {
      const tokenOwners: TokenOwner[] = [];
      for (const user of users) {
        for (const token of user.fcmTokens) {
          tokenOwners.push({ uid: user.uid, token });
        }
      }

      const attempted = tokenOwners.length;
      let succeeded = 0;
      let failed = 0;

      for (let i = 0; i < tokenOwners.length; i += CHUNK_SIZE) {
        const chunk = tokenOwners.slice(i, i + CHUNK_SIZE);
        const result = await this.sendBatch(chunk, summary);
        succeeded += result.succeeded;
        failed += result.failed;
      }

      logger.info(`Sent ${succeeded}/${attempted} FCM tokens for ${summary.ticker}`, {
        ticker: summary.ticker,
        attempted,
        succeeded,
        failed,
      });
    } catch (err) {
      logger.error(`sendNotifications: unexpected error for ${summary.ticker}`, err);
    }
  }

  private async sendBatch(
    chunk: TokenOwner[],
    summary: WeeklySummary,
  ): Promise<{ succeeded: number; failed: number }> {
    const tokens = chunk.map((o) => o.token);
    const multicastMessage = {
      tokens,
      notification: {
        title: summary.messageTitle,
        body: summary.messageShortSummary,
      },
      data: {
        type: 'weekly_summary' as const,
        ticker: summary.ticker,
        weekEndDate: summary.weekEndDate,
      },
    };

    let batchResponse: Awaited<ReturnType<typeof messaging.sendEachForMulticast>>;
    try {
      batchResponse = await retry(
        () => messaging.sendEachForMulticast(multicastMessage),
        FCM_RETRY_OPTIONS,
      );
    } catch (err) {
      logger.error(`FCM batch send failed for ${summary.ticker} — batch skipped`, err);
      return { succeeded: 0, failed: chunk.length };
    }

    return this.handleBatchResponses(batchResponse.responses, chunk);
  }

  private handleBatchResponses(
    responses: Awaited<ReturnType<typeof messaging.sendEachForMulticast>>['responses'],
    chunk: TokenOwner[],
  ): { succeeded: number; failed: number } {
    let succeeded = 0;
    let failed = 0;

    responses.forEach((result, index) => {
      if (result.success) {
        succeeded++;
        return;
      }

      failed++;
      const owner = chunk[index];
      const uid = owner?.uid ?? 'unknown';
      const token = owner?.token ?? '';
      const errorCode = result.error?.code ?? 'unknown';
      const truncatedToken = token.substring(0, TOKEN_LOG_PREFIX_LENGTH) + '...';

      if (
        errorCode === 'messaging/registration-token-not-registered' ||
        errorCode === 'messaging/invalid-registration-token'
      ) {
        logger.warn(`Stale FCM token for uid ${uid} — ${errorCode}`, { uid, token: truncatedToken });
      } else {
        logger.error(`FCM send failed for uid ${uid}: ${errorCode}`, result.error);
      }
    });

    return { succeeded, failed };
  }
}
