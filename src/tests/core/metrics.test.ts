import { emitMetric } from '../../core/metrics';
import { Logger } from '../../core/logger';

jest.mock('../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));

const firstLoggerResult = (Logger as jest.Mock).mock.results[0];
const mockInfo = (firstLoggerResult?.value.info ?? jest.fn()) as jest.Mock;

describe('emitMetric', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('emitMetric_withLabels_logsStructuredPayload', () => {
        // Arrange
        const name = 'filing_processing_failed';
        const labels = { symbol: 'AAPL', formType: '8-K' };

        // Act
        emitMetric(name, labels);

        // Assert
        expect(mockInfo).toHaveBeenCalledWith(
            'metric:filing_processing_failed',
            { metric: name, value: 1, symbol: 'AAPL', formType: '8-K' }
        );
    });

    it('emitMetric_customValue_passesValueThrough', () => {
        // Arrange
        const name = 'sec_filings_page_cap_hit';

        // Act
        emitMetric(name, { formType: '8-K' }, 50);

        // Assert
        expect(mockInfo).toHaveBeenCalledWith(
            'metric:sec_filings_page_cap_hit',
            { metric: name, value: 50, formType: '8-K' }
        );
    });

    it('emitMetric_noLabels_defaultsValueToOne', () => {
        // Arrange
        // Act
        emitMetric('sec_fetch_short_circuited');

        // Assert
        expect(mockInfo).toHaveBeenCalledWith(
            'metric:sec_fetch_short_circuited',
            { metric: 'sec_fetch_short_circuited', value: 1 }
        );
    });
});
