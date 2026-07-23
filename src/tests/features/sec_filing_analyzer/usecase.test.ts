
import { SecFilingAnalyzerUseCase } from '../../../../src/features/sec_filing_analyzer/usecase';
import { AiService } from '../../../../src/core/services/ai_service';
import { SecService } from '../../../../src/core/services/sec_service';
import { ReportService } from '../../../../src/features/sec_filing_analyzer/services/report_service';

const mockAiService = {
    enrichDeepFinancialReport: jest.fn()
} as unknown as AiService;

const mockSecService = {
    getFilingText: jest.fn()
} as unknown as SecService;

const mockReportService = {
    hasReport: jest.fn(),
    saveReport: jest.fn()
} as unknown as ReportService;

const mockUpdate = jest.fn();
const mockPdfLink = "https://sec.gov/filing.htm";

const mockSnapshot = {
    id: "doc123",
    data: () => ({
        symbol: "TEST",
        formType: "10-K",
        filingDate: "2025-01-01",
        link: mockPdfLink
    }),
    ref: {
        update: mockUpdate
    }
} as unknown as FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>;

describe('SecFilingAnalyzerUseCase', () => {
    let useCase: SecFilingAnalyzerUseCase;

    beforeEach(() => {
        jest.clearAllMocks();
        useCase = new SecFilingAnalyzerUseCase(mockAiService, mockSecService, mockReportService);
    });

    test('execute_missingDocumentData_logsWarningAndReturns', async () => {
        // Act & Assert (Implicit)
        await useCase.execute({ ...mockSnapshot, data: () => undefined } as unknown as FirebaseFirestore.DocumentSnapshot);
        expect(mockSecService.getFilingText).not.toHaveBeenCalled();
    });

    test('execute_missingRequiredFields_logsWarningAndReturns', async () => {
        // Act & Assert (Implicit)
        await useCase.execute({
            ...mockSnapshot,
            data: () => ({ symbol: "TEST" })
        } as unknown as FirebaseFirestore.DocumentSnapshot);
        expect(mockSecService.getFilingText).not.toHaveBeenCalled();
    });

    test('execute_reportAlreadyExists_skipsAnalysis', async () => {
        // Arrange
        (mockReportService.hasReport as jest.Mock).mockResolvedValue(true);

        // Act
        await useCase.execute(mockSnapshot);

        // Assert
        expect(mockReportService.hasReport).toHaveBeenCalledWith("TEST_2025-01-01_10-K");
        expect(mockSecService.getFilingText).not.toHaveBeenCalled();
    });

    test('execute_fetchContentFails_abortsAnalysis', async () => {
        // Arrange
        (mockReportService.hasReport as jest.Mock).mockResolvedValue(false);
        (mockSecService.getFilingText as jest.Mock).mockResolvedValue({ status: 'unavailable' });

        // Act
        await useCase.execute(mockSnapshot);

        // Assert
        expect(mockSecService.getFilingText).toHaveBeenCalledWith(mockPdfLink);
        expect(mockAiService.enrichDeepFinancialReport).not.toHaveBeenCalled();
    });

    test('execute_aiAnalysisReturnsNull_abortsSave', async () => {
        // Arrange
        (mockReportService.hasReport as jest.Mock).mockResolvedValue(false);
        (mockSecService.getFilingText as jest.Mock).mockResolvedValue({ status: 'ok', text: 'Raw Filing Text' });
        (mockAiService.enrichDeepFinancialReport as jest.Mock).mockResolvedValue(null);

        // Act
        await useCase.execute(mockSnapshot);

        // Assert
        expect(mockAiService.enrichDeepFinancialReport).toHaveBeenCalled();
        expect(mockReportService.saveReport).not.toHaveBeenCalled();
    });

    test('execute_validDataAndNewReport_performsAnalysisAndSaves', async () => {
        // Arrange
        (mockReportService.hasReport as jest.Mock).mockResolvedValue(false);
        (mockSecService.getFilingText as jest.Mock).mockResolvedValue({ status: 'ok', text: 'Raw Filing Text' });
        (mockAiService.enrichDeepFinancialReport as jest.Mock).mockResolvedValue({
            income: { revenue: { amount: "$10B" } }
        });

        // Act
        await useCase.execute(mockSnapshot);

        // Assert
        expect(mockSecService.getFilingText).toHaveBeenCalledWith(mockPdfLink);
        expect(mockAiService.enrichDeepFinancialReport).toHaveBeenCalledWith("Raw Filing Text", "10-K", "TEST", "2025-01-01");

        expect(mockReportService.saveReport).toHaveBeenCalledWith(expect.objectContaining({
            id: "TEST_2025-01-01_10-K",
            ticker: "TEST",
            income: { revenue: { amount: "$10B" } }
        }));

        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
            deepAnalysisStatus: 'completed'
        }));
    });
});
