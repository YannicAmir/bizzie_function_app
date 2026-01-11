
import { Logger } from '../../core/logger';
import { AiService } from '../../core/services/ai_service';
import { SecService } from '../../core/services/sec_service';
import { ReportService, FinancialReport } from './services/report_service';
import { getFirebaseAdmin } from '../../core/firebase';

const _logger = new Logger('SEC Filing Analyzer UseCase');

export class SecFilingAnalyzerUseCase {
    constructor(
        private aiService: AiService,
        private secService: SecService,
        private reportService: ReportService
    ) { }

    async execute(snap: FirebaseFirestore.DocumentSnapshot): Promise<void> {
        const data = snap.data();
        if (!data) {
            _logger.warn("Document data is missing.");
            return;
        }

        const { symbol, formType, filingDate, link } = data;

        if (!symbol || !formType || !filingDate || !link) {
            _logger.warn(`Missing required fields in SEC Filing doc ${snap.id}. Skipping.`);
            return;
        }

        const filingDateOnly = filingDate.split(' ')[0];
        const reportId = `${symbol}_${filingDateOnly}_${formType}`;

        const exists = await this.reportService.hasReport(reportId);
        if (exists) {
            _logger.info(`Report ${reportId} already analyzed. Skipping.`);
            return;
        }

        _logger.info(`Starting Deep Analysis for ${reportId} from ${link}`);

        const filingText = await this.secService.getFilingText(link);
        if (!filingText) {
            _logger.error(`Failed to fetch text from ${link}`);
            return;
        }

        const analysisResult = await this.aiService.enrichDeepFinancialReport(
            filingText,
            formType,
            symbol,
            filingDate
        );

        if (!analysisResult) {
            _logger.warn("AI analysis returned null. Aborting save.");
            return;
        }

        const report: FinancialReport = {
            id: reportId,
            ticker: symbol,
            filingDate: filingDate,
            dateAnalyzed: new Date().toISOString(),
            formType: formType,
            ...analysisResult
        };

        await this.reportService.saveReport(report);

        await snap.ref.update({
            deepAnalysisStatus: 'completed',
            deepAnalysisId: reportId,
            analyzedAt: getFirebaseAdmin().firestore.FieldValue.serverTimestamp()
        });

        _logger.info(`Successfully analyzed and saved report for ${symbol}`);
    }
}
