import {
    computeOverlapCutoff,
    easternWallTimeToEpochMs,
    formatEasternWallTime
} from '../../../../features/stock_news_notifier/services/date_utils';

describe('formatEasternWallTime', () => {
    it('formatEasternWallTime_winterInstant_returnsEasternStandardWallClock', () => {
        // Arrange
        const epochMs = Date.UTC(2026, 0, 5, 17, 0, 0);

        // Act
        const result = formatEasternWallTime(epochMs);

        // Assert
        expect(result).toBe('2026-01-05 12:00:00');
    });

    it('formatEasternWallTime_summerInstant_appliesDaylightOffset', () => {
        // Arrange
        const epochMs = Date.UTC(2026, 6, 4, 16, 0, 0);

        // Act
        const result = formatEasternWallTime(epochMs);

        // Assert
        expect(result).toBe('2026-07-04 12:00:00');
    });

    it('formatEasternWallTime_easternMidnight_returnsZeroHour', () => {
        // Arrange
        const epochMs = Date.UTC(2026, 0, 5, 5, 0, 0);

        // Act
        const result = formatEasternWallTime(epochMs);

        // Assert
        expect(result).toBe('2026-01-05 00:00:00');
    });
});

describe('easternWallTimeToEpochMs', () => {
    it('easternWallTimeToEpochMs_winterWallTime_roundTripsToOriginalEpoch', () => {
        // Arrange
        const epochMs = Date.UTC(2026, 0, 5, 17, 0, 0);

        // Act
        const result = easternWallTimeToEpochMs('2026-01-05 12:00:00');

        // Assert
        expect(result).toBe(epochMs);
    });

    it('easternWallTimeToEpochMs_summerWallTime_roundTripsToOriginalEpoch', () => {
        // Arrange
        const epochMs = Date.UTC(2026, 6, 4, 16, 0, 0);

        // Act
        const result = easternWallTimeToEpochMs('2026-07-04 12:00:00');

        // Assert
        expect(result).toBe(epochMs);
    });

    it('easternWallTimeToEpochMs_midnightWallTime_roundTripsToOriginalEpoch', () => {
        // Arrange
        const epochMs = Date.UTC(2026, 0, 5, 5, 0, 0);

        // Act
        const result = easternWallTimeToEpochMs('2026-01-05 00:00:00');

        // Assert
        expect(result).toBe(epochMs);
    });
});

describe('computeOverlapCutoff', () => {
    it('computeOverlapCutoff_fiveMinuteWindow_subtractsWindowFromWatermark', () => {
        // Arrange
        const overlapWindowSeconds = 300;

        // Act
        const result = computeOverlapCutoff('2026-01-05 12:00:00', overlapWindowSeconds);

        // Assert
        expect(result).toBe('2026-01-05 11:55:00');
    });

    it('computeOverlapCutoff_windowCrossesMidnight_returnsPreviousDay', () => {
        // Arrange
        const overlapWindowSeconds = 300;

        // Act
        const result = computeOverlapCutoff('2026-01-05 00:02:00', overlapWindowSeconds);

        // Assert
        expect(result).toBe('2026-01-04 23:57:00');
    });
});
