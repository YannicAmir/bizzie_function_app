
import * as crypto from 'crypto';
import { getFirebaseAdmin } from '../firebase';
import { Logger } from '../logger';
import { SecFiling } from './sec_service';

const _logger = new Logger('Filing History Service');

export interface FilingHistoryService {
    hasProcessed(filing: SecFiling): Promise<boolean>;
    markProcessed(filing: SecFiling): Promise<void>;
}

export class FirebaseFilingHistoryService implements FilingHistoryService {
    private collectionName = 'processed_filings';

    private getHash(link: string): string {
        return crypto.createHash('sha256').update(link).digest('hex');
    }

    async hasProcessed(filing: SecFiling): Promise<boolean> {
        if (!filing.finalLink) {
            // If no link, we can't uniquely identify it safely ?
            // Or we could use symbol + date + type?
            // FMP usually provides a link. If not, log warning and maybe skip or process?
            // Let's assume unique link is required for safety.
            _logger.warn(`Filing for ${filing.symbol} has no finalLink. Skipping dedupe check (safe fail -> treat as processed to avoid spam?).`, filing);
            return true; // Treating as processed prevents spamming if data is bad.
        }

        const id = this.getHash(filing.finalLink);
        const doc = await getFirebaseAdmin().firestore().collection(this.collectionName).doc(id).get();
        return doc.exists;
    }

    async markProcessed(filing: SecFiling): Promise<void> {
        if (!filing.finalLink) return;

        const id = this.getHash(filing.finalLink);
        try {
            await getFirebaseAdmin().firestore().collection(this.collectionName).doc(id).set({
                symbol: filing.symbol,
                cik: filing.cik,
                formType: filing.formType,
                fillingDate: filing.filingDate,
                acceptedDate: filing.acceptedDate,
                processedAt: new Date().toISOString(),
                originalLink: filing.finalLink
            });
            // _logger.debug(`Marked filing ${id} as processed.`);
        } catch (error) {
            _logger.error(`Failed to mark filing ${id} as processed`, error);
        }
    }
}
