
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { VertexAiService } from '../../core/services/ai_service';
import { SecFilingAnalyzerUseCase } from './usecase';
import { ReportService } from './services/report_service';
import { FmpSecService } from '../../core/services/sec_service';
import { Logger } from '../../core/logger';

const _logger = new Logger('SEC Filing Analyzer Trigger');
const fmpApiKey = defineSecret('FMP_API_KEY');

// We must instantiate services INSIDE the trigger or lazy load them 
// because we need access to the secret value at runtime, 
// and secrets are only available inside the function handler.

export const secFilingAnalyzerTrigger = onDocumentCreated(
    {
        document: 'sec_filings/{docId}',
        memory: '512MiB',
        timeoutSeconds: 300,
        secrets: [fmpApiKey]
    },
    async (event) => {
        if (!event.data) return;

        try {
            _logger.info(`Triggered for document ${event.params.docId}`);

            const aiService = new VertexAiService();
            const secService = new FmpSecService(fmpApiKey.value());
            const reportService = new ReportService();
            const usecase = new SecFilingAnalyzerUseCase(aiService, secService, reportService);

            await usecase.execute(event.data);
        } catch (error) {
            _logger.error("Global error in SEC Filing Analyzer", error);
        }
    }
);
