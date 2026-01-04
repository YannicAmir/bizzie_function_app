import { ValidatedAIService } from '../../../features/daily_brands/services/ai_service';
import { getGeminiModel } from '../../../core/vertex-ai';
import { getRemoteConfig } from '../../../core/remote-config';

// Mock the Vertex AI module
jest.mock('../../../core/vertex-ai');
// Mock Remote Config
jest.mock('../../../core/remote-config');

// Mock retry to trigger immediately without delays
jest.mock('../../../core/retry', () => ({
    retry: jest.fn(async (fn, options) => {
        const maxAttempts = options?.maxAttempts ?? 3;
        let attempt = 1;
        while (true) {
            try {
                return await fn();
            } catch (error) {
                if (attempt >= maxAttempts) throw error;
                attempt++;
            }
        }
    })
}));

describe('ValidatedAIService', () => {
    let aiService: ValidatedAIService;
    let mockGenerateContent: jest.Mock;

    beforeEach(() => {
        // Setup mock for getGeminiModel
        mockGenerateContent = jest.fn();
        (getGeminiModel as jest.Mock).mockReturnValue({
            generateContent: mockGenerateContent
        });

        // Setup mock for getRemoteConfig
        (getRemoteConfig as jest.Mock).mockResolvedValue({
            gemini_model_name: 'gemini-test-model'
        });

        aiService = new ValidatedAIService();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    const mockSuccessResponse = {
        response: {
            candidates: [{
                content: {
                    parts: [{
                        text: JSON.stringify({
                            products: [{
                                name: "Test Product",
                                description: "Desc",
                                ticker: "TST",
                                company: "Test Co"
                            }]
                        })
                    }]
                }
            }]
        }
    };

    test('retries on failure and eventually succeeds', async () => {
        // Fail twice, then succeed
        mockGenerateContent
            .mockRejectedValueOnce(new Error('Transient Error 1'))
            .mockRejectedValueOnce(new Error('Transient Error 2'))
            .mockResolvedValue(mockSuccessResponse);

        const products = await aiService.generateSectorProducts('Tech');

        expect(products).toHaveLength(1);
        expect(products[0]?.name).toBe('Test Product');
        expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });

    test('fails after max retries', async () => {
        // Fail 4 times (max retries is 3)
        mockGenerateContent.mockRejectedValue(new Error('Persistent Error'));

        await expect(aiService.generateSectorProducts('Tech'))
            .rejects.toThrow('Persistent Error');

        expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });

    test('handles empty AI response as failure and retries', async () => {
        // AI returns empty text once, then succeeds
        mockGenerateContent
            .mockResolvedValueOnce({ response: { candidates: [] } }) // Empty
            .mockResolvedValue(mockSuccessResponse);

        const products = await aiService.generateSectorProducts('Tech');

        expect(products).toHaveLength(1);
        expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });
});
