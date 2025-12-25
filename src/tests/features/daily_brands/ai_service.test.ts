import { ValidatedAIService } from '../../../features/daily_brands/services/ai_service';
import { getGeminiModel } from '../../../core/vertex-ai';

// Mock the Vertex AI module
jest.mock('../../../core/vertex-ai');

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

        // Initial + 3 retries = 4 attempts?? 
        // Wait, retry utility: if maxAttempts=3, it runs 3 times total.
        // Let's check retry.ts logic: "while (true) { ... attempt++; }"
        // If maxAttempts=3:
        // Attempt 1: fail. attempt=2.
        // Attempt 2: fail. attempt=3.
        // Attempt 3: fail. attempt=4. loop breaks.
        // So it mimics "Try up to 3 times".

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
