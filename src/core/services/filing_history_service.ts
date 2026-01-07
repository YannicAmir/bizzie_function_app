
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
            _logger.warn(`Filing for ${filing.symbol} has no finalLink. Skipping dedupe check (safe fail -> treat as processed to avoid spam?).`, filing);
            return true;
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
        } catch (error) {
            _logger.error(`Failed to mark filing ${id} as processed`, error);
        }
    }
}
