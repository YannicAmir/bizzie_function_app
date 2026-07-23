import * as admin from 'firebase-admin';
import { getFirebaseAdmin } from '../firebase';
import { retry } from '../retry';
import { filingDedupeId } from '../filing_id';
import { SecFiling, FORM_TYPE_8K } from './sec_service';
import { Enriched8kData, EnrichedFinancialData } from './ai_service';

const COLLECTION_NAME = 'sec_filings';
const SAVE_MAX_ATTEMPTS = 3;

interface SaveFilingParams {
    filing: SecFiling;
    companyName: string;
    link: string;
}

export interface SaveFinancialReportParams extends SaveFilingParams {
    enriched: EnrichedFinancialData;
}

export interface SaveEnriched8kParams extends SaveFilingParams {
    enriched: Enriched8kData;
}

export interface SecFilingsRepository {
    save(params: SaveFinancialReportParams): Promise<void>;
    saveEnriched8k(params: SaveEnriched8kParams): Promise<void>;
}

export class FirebaseSecFilingsRepository implements SecFilingsRepository {
    async save(params: SaveFinancialReportParams): Promise<void> {
        await this.persist(params, params.filing.formType);
    }

    async saveEnriched8k(params: SaveEnriched8kParams): Promise<void> {
        await this.persist(params, FORM_TYPE_8K);
    }

    private async persist(
        params: SaveFinancialReportParams | SaveEnriched8kParams,
        formType: string,
    ): Promise<void> {
        const { filing, enriched, companyName, link } = params;

        // Controlled fields are spread AFTER `enriched` so a future field on the
        // enriched shapes can never silently overwrite the filing metadata.
        const doc = {
            ...enriched,
            symbol: filing.symbol,
            companyName,
            formType,
            filingDate: filing.filingDate,
            link,
        };

        const ref = getFirebaseAdmin()
            .firestore()
            .collection(COLLECTION_NAME)
            .doc(filingDedupeId(filing));

        await retry(() => ref.set({
            ...doc,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }), { maxAttempts: SAVE_MAX_ATTEMPTS });
    }
}
