import { ScheduledEvent } from 'firebase-functions/v2/scheduler';
import { SubscriptionCleanupUseCase } from '../../../features/subscription_cleanup/usecase';

let triggerHandler: (event: ScheduledEvent) => Promise<void>;

jest.mock('firebase-functions/v2/scheduler', () => ({
    onSchedule: jest.fn().mockImplementation((options, handler) => {
        triggerHandler = handler;
        return handler;
    })
}));

jest.mock('firebase-functions/params', () => ({
    defineSecret: jest.fn().mockReturnValue({
        value: () => 'sk_test_key'
    })
}));

jest.mock('../../../core/firebase', () => ({
    getFirebaseAdmin: jest.fn()
}));

jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }))
}));

jest.mock('../../../core/services/subscription/firestore_service');
jest.mock('../../../core/services/subscription/revenuecat_service');
jest.mock('../../../features/subscription_cleanup/usecase');

if (typeof global.fetch === 'undefined') {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn();
}
if (typeof global.AbortController === 'undefined') {
    (global as unknown as { AbortController: unknown }).AbortController = class AbortController {
        signal = { aborted: false, addEventListener: jest.fn(), removeEventListener: jest.fn() };
        abort() { this.signal.aborted = true; }
    };
}

import '../../../features/subscription_cleanup/trigger';

describe('SubscriptionCleanupTrigger', () => {
    const mockEvent: ScheduledEvent = {
        jobName: 'test-job',
        scheduleTime: new Date().toISOString()
    };

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
    });

    it('subscriptionCleanupTrigger_execute_success', async () => {
        // Arrange
        const mockMetrics = {
            totalScanned: 10,
            totalCorrected: 2,
            totalFailed: 0
        };
        const executeMock = jest.spyOn(SubscriptionCleanupUseCase.prototype, 'execute')
            .mockResolvedValue(mockMetrics);

        // Act
        await triggerHandler(mockEvent);

        // Assert
        expect(executeMock).toHaveBeenCalled();
    });

    it('subscriptionCleanupTrigger_execute_failure', async () => {
        // Arrange
        const mockError = new Error('UseCase failed');
        jest.spyOn(SubscriptionCleanupUseCase.prototype, 'execute')
            .mockRejectedValue(mockError);

        // Act & Assert
        await expect(triggerHandler(mockEvent)).rejects.toThrow(mockError);
    });
});
