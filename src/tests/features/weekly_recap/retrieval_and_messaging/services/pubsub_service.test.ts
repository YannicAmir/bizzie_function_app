import { PubSubService } from '../../../../../features/weekly_recap/retrieval_and_messaging/services/pubsub_service';
import { AppError } from '../../../../../core/errors';
import type { WeeklySummary } from '../../../../../features/weekly_recap/retrieval_and_messaging/models';

let mockPublishMessage: jest.Mock;

jest.mock('@google-cloud/pubsub', () => ({
    PubSub: jest.fn().mockImplementation(() => ({
        topic: jest.fn().mockReturnValue({
            publishMessage: (...args: unknown[]) => mockPublishMessage?.(...args),
        }),
    })),
}));

jest.mock('../../../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    })),
}));

jest.mock('../../../../../core/retry', () => ({
    retry: jest.fn((fn: () => unknown) => fn()),
}));

const validSummary: WeeklySummary = {
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    weekEndDate: '2026-05-25',
    messageTitle: 'AAPL Weekly Recap',
    messageShortSummary: 'Strong performance this week.',
};

describe('PubSubService', () => {
    let service: PubSubService;

    beforeEach(() => {
        // Arrange
        mockPublishMessage = jest.fn().mockResolvedValue('msg-id');
        service = new PubSubService();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('queueSummaries', () => {
        it('queueSummaries_withSummaries_publishesEachSummary', async () => {
            // Arrange
            const summaries: WeeklySummary[] = [
                validSummary,
                { ...validSummary, ticker: 'MSFT', companyName: 'Microsoft Corp.' },
            ];

            // Act
            await service.queueSummaries(summaries);

            // Assert
            expect(mockPublishMessage).toHaveBeenCalledTimes(2);
        });

        it('queueSummaries_emptyArray_doesNotPublish', async () => {
            // Arrange
            const summaries: WeeklySummary[] = [];

            // Act
            await service.queueSummaries(summaries);

            // Assert
            expect(mockPublishMessage).not.toHaveBeenCalled();
        });

        it('queueSummaries_publishesCorrectPayload', async () => {
            // Arrange
            const summaries = [validSummary];

            // Act
            await service.queueSummaries(summaries);

            // Assert
            const [callArg] = mockPublishMessage.mock.calls[0] as [{ data: Buffer }][];
            const decoded = JSON.parse((callArg as unknown as { data: Buffer }).data.toString('utf-8'));
            expect(decoded).toEqual(validSummary);
        });

        it('queueSummaries_publishFails_throws', async () => {
            // Arrange
            mockPublishMessage.mockRejectedValue(new Error('PubSub unavailable'));

            // Act & Assert
            await expect(service.queueSummaries([validSummary])).rejects.toThrow('PubSub unavailable');
        });
    });

    describe('retrieveSummaryFromQueue', () => {
        const encodeMessage = (payload: unknown): { data: string } => ({
            data: Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64'),
        });

        it('retrieveSummaryFromQueue_validMessage_returnsWeeklySummary', () => {
            // Arrange
            const message = encodeMessage(validSummary);

            // Act
            const result = service.retrieveSummaryFromQueue(message);

            // Assert
            expect(result).toEqual(validSummary);
        });

        it('retrieveSummaryFromQueue_invalidJson_throwsAppError', () => {
            // Arrange
            const message = { data: Buffer.from('not-valid-json{{{', 'utf-8').toString('base64') };

            // Act & Assert
            expect(() => service.retrieveSummaryFromQueue(message)).toThrow(AppError);
            expect(() => service.retrieveSummaryFromQueue(message)).toThrow('Failed to deserialize Pub/Sub message');
        });

        it('retrieveSummaryFromQueue_missingTicker_throwsAppError', () => {
            // Arrange
            const message = encodeMessage({
                companyName: validSummary.companyName,
                weekEndDate: validSummary.weekEndDate,
                messageTitle: validSummary.messageTitle,
                messageShortSummary: validSummary.messageShortSummary,
            });

            // Act & Assert
            expect(() => service.retrieveSummaryFromQueue(message)).toThrow(AppError);
            expect(() => service.retrieveSummaryFromQueue(message)).toThrow('missing required fields');
        });

        it('retrieveSummaryFromQueue_missingMessageTitle_throwsAppError', () => {
            // Arrange
            const message = encodeMessage({
                ticker: validSummary.ticker,
                companyName: validSummary.companyName,
                weekEndDate: validSummary.weekEndDate,
                messageShortSummary: validSummary.messageShortSummary,
            });

            // Act & Assert
            expect(() => service.retrieveSummaryFromQueue(message)).toThrow(AppError);
        });

        it('retrieveSummaryFromQueue_tickerNotString_throwsAppError', () => {
            // Arrange
            const message = encodeMessage({ ...validSummary, ticker: 123 });

            // Act & Assert
            expect(() => service.retrieveSummaryFromQueue(message)).toThrow(AppError);
        });
    });
});
