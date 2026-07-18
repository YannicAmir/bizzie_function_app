import { ScheduledEvent } from 'firebase-functions/v2/scheduler';
import { StockNewsNotifierUseCase } from '../../../features/stock_news_notifier/usecase';

let triggerHandler: (event: ScheduledEvent) => Promise<void>;
let capturedOptions: Record<string, unknown>;

jest.mock('firebase-functions/v2/scheduler', () => ({
    onSchedule: jest.fn().mockImplementation((options, handler) => {
        capturedOptions = options;
        triggerHandler = handler;
        return handler;
    })
}));

jest.mock('firebase-functions/params', () => ({
    defineSecret: jest.fn().mockReturnValue({
        value: () => 'test-fmp-key'
    })
}));

jest.mock('../../../core/firebase', () => ({
    getFirebaseAdmin: jest.fn()
}));

jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));

jest.mock('../../../core/services/watchlist_service');
jest.mock('../../../features/stock_news_notifier/services/fcm_service');
jest.mock('../../../features/stock_news_notifier/services/firestore_service');
jest.mock('../../../features/stock_news_notifier/services/fmp_news_service');
jest.mock('../../../features/stock_news_notifier/usecase');

import '../../../features/stock_news_notifier/trigger';

describe('stockNewsNotifier trigger', () => {
    const mockEvent: ScheduledEvent = {
        jobName: 'test-job',
        scheduleTime: new Date().toISOString()
    };
    const originalApiKey = process.env.FMP_API_KEY;

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        process.env.FMP_API_KEY = 'test-fmp-key';
    });

    afterAll(() => {
        if (originalApiKey === undefined) {
            delete process.env.FMP_API_KEY;
        } else {
            process.env.FMP_API_KEY = originalApiKey;
        }
    });

    it('stockNewsNotifier_registration_usesScheduleConfig', () => {
        // Assert
        expect(capturedOptions).toEqual(
            expect.objectContaining({
                schedule: '* 4-23 * * *',
                timeZone: 'America/New_York',
                timeoutSeconds: 60,
                maxInstances: 1
            })
        );
    });

    it('stockNewsNotifier_apiKeyPresent_executesUseCase', async () => {
        // Arrange
        const executeMock = jest.spyOn(StockNewsNotifierUseCase.prototype, 'execute')
            .mockResolvedValue(undefined);

        // Act
        await triggerHandler(mockEvent);

        // Assert
        expect(executeMock).toHaveBeenCalledTimes(1);
    });

    it('stockNewsNotifier_missingApiKey_skipsExecution', async () => {
        // Arrange
        delete process.env.FMP_API_KEY;
        const executeMock = jest.spyOn(StockNewsNotifierUseCase.prototype, 'execute')
            .mockResolvedValue(undefined);

        // Act
        await triggerHandler(mockEvent);

        // Assert
        expect(executeMock).not.toHaveBeenCalled();
    });

    it('stockNewsNotifier_useCaseThrows_resolvesWithoutThrowing', async () => {
        // Arrange
        jest.spyOn(StockNewsNotifierUseCase.prototype, 'execute')
            .mockRejectedValue(new Error('pipeline failed'));

        // Act & Assert
        await expect(triggerHandler(mockEvent)).resolves.toBeUndefined();
    });
});
