import { AiService } from '../../../../features/weekly_recap/storage/services/ai_service';
import type { LLMResponse } from '../../../../features/weekly_recap/storage/models';

jest.mock('@confident-ai/deepeval', () => ({
    traceCallback: jest.fn((fn: () => unknown) => fn()),
    monitor: jest.fn(),
}), { virtual: true });

jest.mock('../../../../core/vertex-ai', () => ({
    getGeminiModel: jest.fn(),
}));

jest.mock('../../../../core/remote-config', () => ({
    getRemoteConfig: jest.fn().mockResolvedValue({
        weekly_recap: { model: 'gemini-1.5-flash' },
    }),
}));

jest.mock('../../../../core/retry', () => ({
    retry: jest.fn((fn: () => unknown) => fn()),
}));

jest.mock('../../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
    })),
}));

// summarizeNews calls Vertex AI LLM — covered by LangSmith/DeepEval, not tested here.

describe('AiService.postProcessLlmSummary', () => {
    let service: AiService;

    const buildResponse = (overrides: Partial<LLMResponse> = {}): LLMResponse => ({
        ticker: 'AAPL',
        companyName: 'Apple Inc.',
        time: '2026-05-15T00:00:00.000Z',
        messageTitle: 'Weekly Recap',
        messageShortSummary: 'Markets up.',
        messageLongSummary: 'Apple had a great week.',
        confidenceScore: 80,
        newArticleCount: 3,
        eightKCount: 0,
        eodStockPriceCount: 5,
        newsLinks: [],
        eightKLinks: [],
        priceMovement: { startPrice: 200, endPrice: 210, priceChange: 10, priceChangePercent: 5 },
        ...overrides,
    });

    beforeEach(() => {
        // Arrange
        service = new AiService();
    });

    it('postProcessLlmSummary_titleUnder50Chars_returnsUnchanged', () => {
        // Arrange
        const response = buildResponse({ messageTitle: 'Short Title' });

        // Act
        const result = service.postProcessLlmSummary(response);

        // Assert
        expect(result.messageTitle).toBe('Short Title');
    });

    it('postProcessLlmSummary_titleExactly50Chars_returnsUnchanged', () => {
        // Arrange
        const title = 'A'.repeat(50);
        const response = buildResponse({ messageTitle: title });

        // Act
        const result = service.postProcessLlmSummary(response);

        // Assert
        expect(result.messageTitle).toBe(title);
        expect(result.messageTitle).toHaveLength(50);
    });

    it('postProcessLlmSummary_titleOver50Chars_truncatesToFiftyAndTrims', () => {
        // Arrange
        const longTitle = 'A'.repeat(80);
        const response = buildResponse({ messageTitle: longTitle });

        // Act
        const result = service.postProcessLlmSummary(response);

        // Assert
        expect(result.messageTitle).toHaveLength(50);
        expect(result.messageTitle).toBe('A'.repeat(50));
    });

    it('postProcessLlmSummary_shortSummaryWithMarkdownFences_stripsMarkdown', () => {
        // Arrange
        const response = buildResponse({ messageShortSummary: '```\nMarkets rose.\n```' });

        // Act
        const result = service.postProcessLlmSummary(response);

        // Assert
        expect(result.messageShortSummary).toBe('Markets rose.');
    });

    it('postProcessLlmSummary_longSummaryWithBoldAsterisks_stripsAsterisks', () => {
        // Arrange
        const response = buildResponse({ messageLongSummary: '**Apple** had a **strong** week.' });

        // Act
        const result = service.postProcessLlmSummary(response);

        // Assert
        expect(result.messageLongSummary).toBe('Apple had a strong week.');
    });

    it('postProcessLlmSummary_summaryWithLeadingTrailingWhitespace_trims', () => {
        // Arrange
        const response = buildResponse({ messageShortSummary: '  Markets up.  ' });

        // Act
        const result = service.postProcessLlmSummary(response);

        // Assert
        expect(result.messageShortSummary).toBe('Markets up.');
    });

    it('postProcessLlmSummary_allOtherFields_passedThrough', () => {
        // Arrange
        const response = buildResponse();

        // Act
        const result = service.postProcessLlmSummary(response);

        // Assert
        expect(result.ticker).toBe('AAPL');
        expect(result.confidenceScore).toBe(80);
        expect(result.priceMovement).toEqual(response.priceMovement);
        expect(result.newsLinks).toEqual([]);
    });
});
