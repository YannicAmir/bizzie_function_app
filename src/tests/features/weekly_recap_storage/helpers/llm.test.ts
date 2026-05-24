import { isValidLLMPartial, isRetryableLlmError, truncateToTokens, stripMarkdown } from '../../../../features/weekly_recap/storage/helpers/llm';

describe('isValidLLMPartial', () => {
    it('isValidLLMPartial_allFieldsPresent_returnsTrue', () => {
        // Arrange
        const partial = {
            messageTitle: 'Weekly Recap',
            messageShortSummary: 'Markets moved up.',
            messageLongSummary: 'A detailed narrative of the week.',
            confidenceScore: 80,
            newsLinks: ['https://news.com/a'],
            eightKLinks: [],
        };

        // Act
        const result = isValidLLMPartial(partial);

        // Assert
        expect(result).toBe(true);
    });

    it('isValidLLMPartial_confidenceScore0_returnsTrue', () => {
        // Arrange
        const partial = {
            messageTitle: 'Title',
            messageShortSummary: 'Short',
            messageLongSummary: 'Long',
            confidenceScore: 0,
            newsLinks: [],
            eightKLinks: [],
        };

        // Act
        const result = isValidLLMPartial(partial);

        // Assert
        expect(result).toBe(true);
    });

    it('isValidLLMPartial_confidenceScore100_returnsTrue', () => {
        // Arrange
        const partial = {
            messageTitle: 'Title',
            messageShortSummary: 'Short',
            messageLongSummary: 'Long',
            confidenceScore: 100,
            newsLinks: [],
            eightKLinks: [],
        };

        // Act
        const result = isValidLLMPartial(partial);

        // Assert
        expect(result).toBe(true);
    });

    it('isValidLLMPartial_missingMessageTitle_returnsFalse', () => {
        // Arrange
        const partial = {
            messageShortSummary: 'Short',
            messageLongSummary: 'Long',
            confidenceScore: 80,
            newsLinks: [],
            eightKLinks: [],
        };

        // Act
        const result = isValidLLMPartial(partial);

        // Assert
        expect(result).toBe(false);
    });

    it('isValidLLMPartial_confidenceScoreAbove100_returnsFalse', () => {
        // Arrange
        const partial = {
            messageTitle: 'Title',
            messageShortSummary: 'Short',
            messageLongSummary: 'Long',
            confidenceScore: 101,
            newsLinks: [],
            eightKLinks: [],
        };

        // Act
        const result = isValidLLMPartial(partial);

        // Assert
        expect(result).toBe(false);
    });

    it('isValidLLMPartial_confidenceScoreNegative_returnsFalse', () => {
        // Arrange
        const partial = {
            messageTitle: 'Title',
            messageShortSummary: 'Short',
            messageLongSummary: 'Long',
            confidenceScore: -1,
            newsLinks: [],
            eightKLinks: [],
        };

        // Act
        const result = isValidLLMPartial(partial);

        // Assert
        expect(result).toBe(false);
    });

    it('isValidLLMPartial_confidenceScoreFloat_returnsFalse', () => {
        // Arrange
        const partial = {
            messageTitle: 'Title',
            messageShortSummary: 'Short',
            messageLongSummary: 'Long',
            confidenceScore: 80.5,
            newsLinks: [],
            eightKLinks: [],
        };

        // Act
        const result = isValidLLMPartial(partial);

        // Assert
        expect(result).toBe(false);
    });

    it('isValidLLMPartial_newsLinksNotArray_returnsFalse', () => {
        // Arrange
        const partial = {
            messageTitle: 'Title',
            messageShortSummary: 'Short',
            messageLongSummary: 'Long',
            confidenceScore: 80,
            newsLinks: 'not-an-array' as unknown as string[],
            eightKLinks: [],
        };

        // Act
        const result = isValidLLMPartial(partial);

        // Assert
        expect(result).toBe(false);
    });

    it('isValidLLMPartial_messageLongSummaryMissing_returnsFalse', () => {
        // Arrange
        const partial = {
            messageTitle: 'Title',
            messageShortSummary: 'Short',
            confidenceScore: 80,
            newsLinks: [],
            eightKLinks: [],
        };

        // Act
        const result = isValidLLMPartial(partial);

        // Assert
        expect(result).toBe(false);
    });
});

describe('isRetryableLlmError', () => {
    it('isRetryableLlmError_status429_returnsTrue', () => {
        // Arrange
        const err = { status: 429 };

        // Act
        const result = isRetryableLlmError(err);

        // Assert
        expect(result).toBe(true);
    });

    it('isRetryableLlmError_status500_returnsTrue', () => {
        // Arrange
        const err = { status: 500 };

        // Act
        const result = isRetryableLlmError(err);

        // Assert
        expect(result).toBe(true);
    });

    it('isRetryableLlmError_status503_returnsTrue', () => {
        // Arrange
        const err = { status: 503 };

        // Act
        const result = isRetryableLlmError(err);

        // Assert
        expect(result).toBe(true);
    });

    it('isRetryableLlmError_messageUnavailable_returnsTrue', () => {
        // Arrange
        const err = new Error('UNAVAILABLE: service temporarily down');

        // Act
        const result = isRetryableLlmError(err);

        // Assert
        expect(result).toBe(true);
    });

    it('isRetryableLlmError_messageDeadlineExceeded_returnsTrue', () => {
        // Arrange
        const err = new Error('DEADLINE_EXCEEDED');

        // Act
        const result = isRetryableLlmError(err);

        // Assert
        expect(result).toBe(true);
    });

    it('isRetryableLlmError_invalidSchemaMessage_returnsTrue', () => {
        // Arrange
        const err = new Error('Invalid LLM response schema');

        // Act
        const result = isRetryableLlmError(err);

        // Assert
        expect(result).toBe(true);
    });

    it('isRetryableLlmError_httpStatusCode429_returnsTrue', () => {
        // Arrange
        const err = { httpStatusCode: 429 };

        // Act
        const result = isRetryableLlmError(err);

        // Assert
        expect(result).toBe(true);
    });

    it('isRetryableLlmError_status404_returnsFalse', () => {
        // Arrange
        const err = { status: 404 };

        // Act
        const result = isRetryableLlmError(err);

        // Assert
        expect(result).toBe(false);
    });

    it('isRetryableLlmError_genericError_returnsFalse', () => {
        // Arrange
        const err = new Error('Something went wrong');

        // Act
        const result = isRetryableLlmError(err);

        // Assert
        expect(result).toBe(false);
    });
});

describe('truncateToTokens', () => {
    it('truncateToTokens_textWithinLimit_returnsOriginal', () => {
        // Arrange
        const text = 'Short text';
        const maxTokens = 100;

        // Act
        const result = truncateToTokens(text, maxTokens);

        // Assert
        expect(result).toBe(text);
    });

    it('truncateToTokens_textExceedsLimit_truncatesAtFourCharsPerToken', () => {
        // Arrange
        const text = 'a'.repeat(200);
        const maxTokens = 10;

        // Act
        const result = truncateToTokens(text, maxTokens);

        // Assert
        expect(result).toHaveLength(40);
        expect(result).toBe('a'.repeat(40));
    });

    it('truncateToTokens_textExactlyAtLimit_returnsOriginal', () => {
        // Arrange
        const text = 'b'.repeat(40);
        const maxTokens = 10;

        // Act
        const result = truncateToTokens(text, maxTokens);

        // Assert
        expect(result).toBe(text);
    });
});

describe('stripMarkdown', () => {
    it('stripMarkdown_jsonCodeFences_removesFences', () => {
        // Arrange
        const input = '```json\n{"key":"value"}\n```';

        // Act
        const result = stripMarkdown(input);

        // Assert
        expect(result).toBe('{"key":"value"}');
    });

    it('stripMarkdown_plainCodeFences_removesFences', () => {
        // Arrange
        const input = '```\nplain content\n```';

        // Act
        const result = stripMarkdown(input);

        // Assert
        expect(result).toBe('plain content');
    });

    it('stripMarkdown_boldAsterisks_removesAsterisks', () => {
        // Arrange
        const input = '**bold text** here';

        // Act
        const result = stripMarkdown(input);

        // Assert
        expect(result).toBe('bold text here');
    });

    it('stripMarkdown_italicAsterisks_removesAsterisks', () => {
        // Arrange
        const input = '*italic* word';

        // Act
        const result = stripMarkdown(input);

        // Assert
        expect(result).toBe('italic word');
    });

    it('stripMarkdown_alreadyCleanText_returnsAsIs', () => {
        // Arrange
        const input = 'Plain sentence with no markdown.';

        // Act
        const result = stripMarkdown(input);

        // Assert
        expect(result).toBe('Plain sentence with no markdown.');
    });

    it('stripMarkdown_leadingAndTrailingWhitespace_trims', () => {
        // Arrange
        const input = '  Clean text  ';

        // Act
        const result = stripMarkdown(input);

        // Assert
        expect(result).toBe('Clean text');
    });
});
