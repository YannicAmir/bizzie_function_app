import { getFirebaseAdmin } from '../firebase';
import { Logger } from '../logger';
import { emitMetric, MetricLabels } from '../metrics';
import { retry } from '../retry';
import { filingDedupeId } from '../filing_id';
import { SecFiling } from './sec_service';

const _logger = new Logger('Filing History Service');

export const FilingStatus = {
    Processing: 'processing',
    Sent: 'sent',
    Failed: 'failed',
} as const;
export type FilingStatus = typeof FilingStatus[keyof typeof FilingStatus];

const DEFAULT_LEASE_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const MARK_SENT_MAX_ATTEMPTS = 3;
const LEASE_CLEARED = null;

export interface FilingHistoryService {
    claimForProcessing(filing: SecFiling, leaseMs?: number, maxAttempts?: number): Promise<boolean>;
    markSent(filing: SecFiling): Promise<void>;
    releaseClaim(filing: SecFiling): Promise<void>;
}

interface StoredFiling {
    status?: FilingStatus;
    leaseExpiresAt?: number | null;
    attempts?: number;
}

interface FilingDocumentWrite {
    symbol?: string;
    cik?: string;
    formType?: string;
    filingDate?: string;
    acceptedDate?: string;
    finalLink?: string;
    status?: FilingStatus;
    leaseExpiresAt?: number | null;
    attempts?: number;
    updatedAt?: string;
    sentAt?: string;
    failedAt?: string;
}

interface ClaimOutcome {
    claimed: boolean;
    reclaimed: boolean;
    gaveUp: boolean;
}

export class FirebaseFilingHistoryService implements FilingHistoryService {
    private collectionName = 'processed_filings';

    private getHash(filing: SecFiling): string {
        return filingDedupeId(filing);
    }

    private docRef(filing: SecFiling): FirebaseFirestore.DocumentReference {
        return getFirebaseAdmin().firestore().collection(this.collectionName).doc(this.getHash(filing));
    }

    async claimForProcessing(
        filing: SecFiling,
        leaseMs: number = DEFAULT_LEASE_MS,
        maxAttempts: number = DEFAULT_MAX_ATTEMPTS
    ): Promise<boolean> {
        if (!filing.finalLink) {
            _logger.warn(`Filing for ${filing.symbol} has no finalLink; cannot dedupe, not claiming.`, filing);
            return false;
        }

        let outcome: ClaimOutcome;
        try {
            outcome = await this.runClaimTransaction(filing, leaseMs, maxAttempts);
        } catch (error) {
            _logger.error(`Failed to claim filing ${filing.symbol} for processing`, error);
            return false;
        }

        this.reportClaimOutcome(outcome, filing, maxAttempts);
        return outcome.claimed;
    }

    private runClaimTransaction(
        filing: SecFiling,
        leaseMs: number,
        maxAttempts: number
    ): Promise<ClaimOutcome> {
        const ref = this.docRef(filing);
        const now = Date.now();

        return getFirebaseAdmin().firestore().runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const data: StoredFiling = snap.exists ? ((snap.data() as StoredFiling) ?? {}) : {};

            if (snap.exists && !this.isLeaseClaimable(data, now)) {
                return { claimed: false, reclaimed: false, gaveUp: false };
            }

            const priorAttempts = typeof data.attempts === 'number' ? data.attempts : 0;
            const nextAttempts = priorAttempts + 1;

            if (nextAttempts > maxAttempts) {
                tx.set(ref, this.buildFailedUpdate(filing, nextAttempts), { merge: true });
                return { claimed: false, reclaimed: false, gaveUp: true };
            }

            tx.set(ref, this.buildClaimUpdate(filing, nextAttempts, now + leaseMs), { merge: true });
            return { claimed: true, reclaimed: snap.exists, gaveUp: false };
        });
    }

    private buildFailedUpdate(filing: SecFiling, attempts: number): FilingDocumentWrite {
        const timestamp = this.nowIso();
        return {
            symbol: filing.symbol,
            status: FilingStatus.Failed,
            attempts,
            leaseExpiresAt: LEASE_CLEARED,
            failedAt: timestamp,
            updatedAt: timestamp,
        };
    }

    private buildClaimUpdate(filing: SecFiling, attempts: number, leaseExpiresAt: number): FilingDocumentWrite {
        return {
            symbol: filing.symbol,
            cik: filing.cik,
            formType: filing.formType,
            filingDate: filing.filingDate,
            acceptedDate: filing.acceptedDate,
            finalLink: filing.finalLink,
            status: FilingStatus.Processing,
            leaseExpiresAt,
            attempts,
            updatedAt: this.nowIso(),
        };
    }

    private nowIso(): string {
        return new Date().toISOString();
    }

    private filingLabels(filing: SecFiling): MetricLabels {
        return { symbol: filing.symbol, formType: filing.formType };
    }

    private isLeaseClaimable(data: StoredFiling, now: number): boolean {
        if (data.status !== FilingStatus.Processing) return false;
        if (typeof data.leaseExpiresAt === 'number' && data.leaseExpiresAt > now) return false;
        return true;
    }

    private reportClaimOutcome(outcome: ClaimOutcome, filing: SecFiling, maxAttempts: number): void {
        if (outcome.gaveUp) {
            _logger.error(`Filing ${filing.symbol} exceeded ${maxAttempts} attempts; marking terminally failed.`, filing);
            emitMetric('filing_processing_failed', this.filingLabels(filing));
        } else if (outcome.claimed && outcome.reclaimed) {
            _logger.warn(`Reclaimed stale lease for ${filing.symbol} (prior worker crashed; a duplicate notification is possible).`);
            emitMetric('filing_lease_reclaimed', this.filingLabels(filing));
        }
    }

    async markSent(filing: SecFiling): Promise<void> {
        if (!filing.finalLink) return;
        const ref = this.docRef(filing);
        try {
            const update: FilingDocumentWrite = {
                status: FilingStatus.Sent,
                leaseExpiresAt: LEASE_CLEARED,
                sentAt: this.nowIso(),
            };
            await retry(() => ref.set(update, { merge: true }), { maxAttempts: MARK_SENT_MAX_ATTEMPTS });
        } catch (error) {
            _logger.error(
                `Failed to mark filing ${filing.symbol} as sent after ${MARK_SENT_MAX_ATTEMPTS} attempts; ` +
                `lease may expire and trigger a duplicate notification.`,
                error
            );
            emitMetric('filing_mark_sent_failed', this.filingLabels(filing));
        }
    }

    async releaseClaim(filing: SecFiling): Promise<void> {
        if (!filing.finalLink) return;
        try {
            await this.docRef(filing).set({ leaseExpiresAt: LEASE_CLEARED }, { merge: true });
        } catch (error) {
            _logger.error(`Failed to release claim for filing ${filing.symbol}`, error);
        }
    }
}
