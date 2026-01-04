import { VertexAiService } from '../../../core/services/ai_service';
import * as vertexAi from '../../../core/vertex-ai';
import * as remoteConfig from '../../../core/remote-config';


// Mock dependencies
jest.mock('../../../core/vertex-ai');
jest.mock('../../../core/remote-config');
jest.mock('../../../core/retry', () => ({
    retry: jest.fn((fn) => fn()) // Pass through
}));
jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));

describe('VertexAiService', () => {
    let service: VertexAiService;
    let mockGenerateContent: jest.Mock;

    beforeEach(() => {
        service = new VertexAiService();
        mockGenerateContent = jest.fn();

        // Setup default mocks
        (vertexAi.getGeminiModel as jest.Mock).mockReturnValue({
            generateContent: mockGenerateContent
        });

        (remoteConfig.getRemoteConfig as jest.Mock).mockResolvedValue({
            gemini_model_name: 'gemini-test-model',
            sectors: []
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('enrich8k', () => {
        it('enrich8k_validEarnings_returnsData', async () => {
            const mockResponse = {
                topic: 'Earnings',
                summary: 'Apple reported huge earnings.',
                isEarnings: true,
                revenue: '$100B',
                eps: '$2.00',
                sentiment: 'Positive'
            };

            mockGenerateContent.mockResolvedValue({
                response: {
                    candidates: [{
                        content: { parts: [{ text: JSON.stringify(mockResponse) }] }
                    }]
                }
            });

            const result = await service.enrich8k('Sample 8-K text');

            expect(result).toEqual({
                topic: 'Earnings',
                summary: 'Apple reported huge earnings.',
                isEarnings: true,
                revenue: '$100B',
                eps: '$2.00',
                sentiment: 'Positive'
            });
            expect(vertexAi.getGeminiModel).toHaveBeenCalledWith('gemini-test-model');
        });

        it('enrich8k_irrelevantTopic_returnsNull', async () => {
            const mockResponse = {
                topic: null,
                summary: 'Nothing important'
            };

            mockGenerateContent.mockResolvedValue({
                response: {
                    candidates: [{
                        content: { parts: [{ text: JSON.stringify(mockResponse) }] }
                    }]
                }
            });

            const result = await service.enrich8k('Boilerplate text');
            expect(result).toBeNull();
        });

        it('enrich8k_emptyAiResponse_returnsNull', async () => {
            mockGenerateContent.mockResolvedValue({
                response: { candidates: [] } // Empty
            });

            const result = await service.enrich8k('Text');
            expect(result).toBeNull();
        });
    });

    describe('enrichFinancialReport', () => {
        it('enrichFinancialReport_valid10K_returnsData', async () => {
            const mockResponse = {
                revenue: '$10M',
                eps: '$0.50',
                summary: 'Revenue up due to sales.'
            };

            mockGenerateContent.mockResolvedValue({
                response: {
                    candidates: [{
                        content: { parts: [{ text: JSON.stringify(mockResponse) }] }
                    }]
                }
            });

            const result = await service.enrichFinancialReport('10-K Text', '10-K');

            expect(result).toEqual({
                revenue: '$10M',
                eps: '$0.50',
                summary: 'Revenue up due to sales.'
            });

            // Verify prompt contained 10-K specific instructions (rough check)
            const callArgs = mockGenerateContent.mock.calls[0][0];
            expect(callArgs.contents[0].parts[0].text).toContain('SEC 10-K filing');
            expect(callArgs.contents[0].parts[0].text).toContain('GOAL: Extract key financial metrics');
        });

        it('enrichFinancialReport_valid10Q_returnsData', async () => {
            const mockResponse = {
                revenue: '$5M',
                eps: '$0.10',
                summary: 'Revenue down seasonally.'
            };

            mockGenerateContent.mockResolvedValue({
                response: {
                    candidates: [{
                        content: { parts: [{ text: JSON.stringify(mockResponse) }] }
                    }]
                }
            });

            const result = await service.enrichFinancialReport('10-Q Text', '10-Q');

            expect(result).toEqual(mockResponse);

            // Verify prompt contained 10-Q specific instructions
            const callArgs = mockGenerateContent.mock.calls[0][0];
            expect(callArgs.contents[0].parts[0].text).toContain('SEC 10-Q filing');
            expect(callArgs.contents[0].parts[0].text).toContain('if 10-Q is provided, focus STRICTLY');
        });

        it('enrichFinancialReport_aiFailure_throwsError', async () => {
            mockGenerateContent.mockRejectedValue(new Error('API Down'));

            // Since we mocked retry to just call callback, it should throw immediately
            await expect(service.enrichFinancialReport('Text', '10-K'))
                .rejects.toThrow('API Down');
        });
    });
});
