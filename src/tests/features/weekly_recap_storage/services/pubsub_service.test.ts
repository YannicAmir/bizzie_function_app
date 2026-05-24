import { PubSubService } from '../../../../features/weekly_recap/storage/services/pubsub_service';
import { AppError } from '../../../../core/errors';

let mockPublishMessage: jest.Mock;

jest.mock('@google-cloud/pubsub', () => ({
    PubSub: jest.fn().mockImplementation(() => ({
        topic: jest.fn().mockReturnValue({
            publishMessage: (...args: unknown[]) => mockPublishMessage?.(...args),
        }),
    })),
}));

jest.mock('../../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    })),
}));

jest.mock('../../../../core/retry', () => ({
    retry: jest.fn((fn: () => unknown) => fn()),
}));

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

    describe('queueCompanies', () => {
        it('queueCompanies_allSucceed_returnsFullCount', async () => {
            // Arrange
            const companies = [
                { ticker: 'AAPL', companyName: 'Apple Inc.' },
                { ticker: 'MSFT', companyName: 'Microsoft Corp.' },
            ];

            // Act
            const result = await service.queueCompanies(companies);

            // Assert
            expect(result).toBe(2);
            expect(mockPublishMessage).toHaveBeenCalledTimes(2);
        });

        it('queueCompanies_emptyList_returnsZero', async () => {
            // Arrange
            const companies: { ticker: string; companyName: string }[] = [];

            // Act
            const result = await service.queueCompanies(companies);

            // Assert
            expect(result).toBe(0);
            expect(mockPublishMessage).not.toHaveBeenCalled();
        });

        it('queueCompanies_onePublishFails_skipsAndReturnsPartialCount', async () => {
            // Arrange
            const companies = [
                { ticker: 'AAPL', companyName: 'Apple Inc.' },
                { ticker: 'FAIL', companyName: 'Failing Corp.' },
                { ticker: 'MSFT', companyName: 'Microsoft Corp.' },
            ];
            mockPublishMessage
                .mockResolvedValueOnce('msg-1')
                .mockRejectedValueOnce(new Error('PubSub error'))
                .mockResolvedValueOnce('msg-3');

            // Act
            const result = await service.queueCompanies(companies);

            // Assert
            expect(result).toBe(2);
        });

        it('queueCompanies_publishesCorrectPayload_includesTickerAndCompanyName', async () => {
            // Arrange
            const companies = [{ ticker: 'AAPL', companyName: 'Apple Inc.' }];

            // Act
            await service.queueCompanies(companies);

            // Assert
            const [callArg] = mockPublishMessage.mock.calls[0] as [{ data: Buffer }][];
            const decoded = JSON.parse((callArg as unknown as { data: Buffer }).data.toString('utf-8'));
            expect(decoded).toEqual({ ticker: 'AAPL', companyName: 'Apple Inc.' });
        });
    });

    describe('retrieveCompanyFromQueue', () => {
        const encodeMessage = (payload: unknown): { data: string } => ({
            data: Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64'),
        });

        it('retrieveCompanyFromQueue_validMessage_returnsCompany', () => {
            // Arrange
            const message = encodeMessage({ ticker: 'AAPL', companyName: 'Apple Inc.' });

            // Act
            const result = service.retrieveCompanyFromQueue(message);

            // Assert
            expect(result).toEqual({ ticker: 'AAPL', companyName: 'Apple Inc.' });
        });

        it('retrieveCompanyFromQueue_invalidJson_throwsAppError', () => {
            // Arrange
            const message = { data: Buffer.from('not-json', 'utf-8').toString('base64') };

            // Act & Assert
            expect(() => service.retrieveCompanyFromQueue(message)).toThrow(AppError);
            expect(() => service.retrieveCompanyFromQueue(message)).toThrow('Failed to deserialize Pub/Sub message');
        });

        it('retrieveCompanyFromQueue_missingTicker_throwsAppError', () => {
            // Arrange
            const message = encodeMessage({ companyName: 'Apple Inc.' });

            // Act & Assert
            expect(() => service.retrieveCompanyFromQueue(message)).toThrow(AppError);
            expect(() => service.retrieveCompanyFromQueue(message)).toThrow(
                'Pub/Sub message missing required fields: ticker, companyName',
            );
        });

        it('retrieveCompanyFromQueue_missingCompanyName_throwsAppError', () => {
            // Arrange
            const message = encodeMessage({ ticker: 'AAPL' });

            // Act & Assert
            expect(() => service.retrieveCompanyFromQueue(message)).toThrow(AppError);
        });

        it('retrieveCompanyFromQueue_tickerNotString_throwsAppError', () => {
            // Arrange
            const message = encodeMessage({ ticker: 123, companyName: 'Apple Inc.' });

            // Act & Assert
            expect(() => service.retrieveCompanyFromQueue(message)).toThrow(AppError);
        });
    });
});
