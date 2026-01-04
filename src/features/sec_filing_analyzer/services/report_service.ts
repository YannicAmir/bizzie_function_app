
import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';
import { DeepFinancialAnalysis } from '../../../core/services/ai_service';

// Mix the strict analysis interface with our metadata fields
export interface FinancialReport extends DeepFinancialAnalysis {
    id: string;
    ticker: string;
    filingDate: string;
    dateAnalyzed: string;
    formType: "10-K" | "10-Q";
}

const _logger = new Logger('Report Service');

export class ReportService {
    private collection = getFirebaseAdmin().firestore().collection('financial_reports');

    async saveReport(report: FinancialReport): Promise<void> {
        try {
            await this.collection.doc(report.id).set(report, { merge: true });
            _logger.info(`Saved financial report: ${report.id}`);
        } catch (error) {
            _logger.error(`Failed to save report ${report.id}`, error);
            throw error;
        }
    }

    async hasReport(id: string): Promise<boolean> {
        const doc = await this.collection.doc(id).get();
        return doc.exists;
    }
}
