
import { ReportService, FinancialReport } from '../../../../../src/features/sec_filing_analyzer/services/report_service';
import { getFirebaseAdmin } from '../../../../../src/core/firebase';

// Mock dependencies
jest.mock('../../../../../src/core/firebase', () => ({
    getFirebaseAdmin: jest.fn()
}));

// Mock Firestore Chain
const mockSet = jest.fn();
const mockGet = jest.fn();
const mockDocFn = jest.fn();
const mockCollectionFn = jest.fn();

const mockFirestore = {
    collection: mockCollectionFn
};

const mockAdmin = {
    firestore: () => mockFirestore
};

describe('ReportService', () => {
    let service: ReportService;

    // Reset mocks before each test
    beforeEach(() => {
        jest.clearAllMocks();

        // Setup default mock return values
        // Note: ReportService calls getFirebaseAdmin().firestore().collection(...) in its constructor/property initializer
        (getFirebaseAdmin as jest.Mock).mockReturnValue(mockAdmin);
        mockCollectionFn.mockReturnValue({ doc: mockDocFn });
        mockDocFn.mockReturnValue({
            set: mockSet,
            get: mockGet
        });

        // Initialize service
        service = new ReportService();
    });

    test('saveReport_validReport_savesToFirestore', async () => {
        const report: FinancialReport = {
            id: 'TEST_2025_10K',
            ticker: 'TEST',
            filingDate: '2025-01-01',
            formType: '10-K',
            dateAnalyzed: '2025-01-02',
            income: {
                revenue: { amount: "$100", changeAmount: "$10", changePercent: "10%", driver: "Growth", citationPage: 1 },
                costOfRevenue: { amount: "$50", changeAmount: "$5", changePercent: "10%", citationPage: 1 },
                totalExpenses: { amount: "$80", changeAmount: "$8", changePercent: "10%", driver: "Costs", citationPage: 1 },
                netIncome: { amount: "$20", changeAmount: "$2", changePercent: "10%", driver: null, citationPage: 1 },
                eps: { amount: "$1.5", changeAmount: "$0.1", changePercent: "6%", citationPage: 1 }
            },
            balanceSheet: {
                totalAssets: { amount: "$500", changeAmount: "$0", changePercent: "0%", citationPage: 2 },
                totalLiabilities: { amount: "$200", changeAmount: "$0", changePercent: "0%", citationPage: 2 },
                equity: { amount: "$300", changeAmount: "$0", changePercent: "0%", citationPage: 2 }
            },
            cashFlow: {
                freeCashFlow: { amount: "$10", changeAmount: "$1", changePercent: "10%", driver: "CapEx", citationPage: 3 }
            },
            stockActivity: {
                repurchasedShares: "0",
                issuedShares: "0",
                netStockChangeShares: "0",
                citationPage: 4
            },
            summary: {
                forwardLooking: "Positive outlook",
                citationPage: 1
            }
        };

        await service.saveReport(report);

        expect(mockCollectionFn).toHaveBeenCalledWith('financial_reports');
        expect(mockDocFn).toHaveBeenCalledWith('TEST_2025_10K');
        expect(mockSet).toHaveBeenCalledWith(report, { merge: true });
    });

    test('saveReport_firestoreError_throwsError', async () => {
        const report = {
            id: 'TEST_ERR',
            ticker: 'TEST',
            filingDate: '2025-01-01',
            formType: '10-G',
            dateAnalyzed: '2025-01-02'
        } as unknown as FinancialReport;

        mockSet.mockRejectedValue(new Error("Firestore write failed"));

        await expect(service.saveReport(report)).rejects.toThrow("Firestore write failed");
    });

    test('hasReport_documentExists_returnsTrue', async () => {
        mockGet.mockResolvedValue({ exists: true });

        const exists = await service.hasReport('TEST_EXISTS');

        expect(mockDocFn).toHaveBeenCalledWith('TEST_EXISTS');
        expect(exists).toBe(true);
    });

    test('hasReport_documentDoesNotExist_returnsFalse', async () => {
        mockGet.mockResolvedValue({ exists: false });

        const exists = await service.hasReport('TEST_MISSING');

        expect(exists).toBe(false);
    });
});
