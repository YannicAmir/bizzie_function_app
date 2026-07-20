import {
    computeOverlapCutoff,
    easternMinutesSinceMidnight,
    easternWallTimeToEpochMs,
    formatEasternWallTime,
    isMondayEastern,
    subtractCalendarDays,
    todayEasternDate
} from '../../core/date_utils';

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

describe('todayEasternDate', () => {
    it('todayEasternDate_afternoonUtcInstant_returnsEasternDate', () => {
        // Arrange
        const epochMs = Date.UTC(2026, 0, 5, 17, 0, 0);

        // Act
        const result = todayEasternDate(epochMs);

        // Assert
        expect(result).toBe('2026-01-05');
    });

    it('todayEasternDate_utcPastMidnightBeforeEastern_returnsPreviousDay', () => {
        // Arrange
        const epochMs = Date.UTC(2026, 0, 5, 3, 0, 0);

        // Act
        const result = todayEasternDate(epochMs);

        // Assert
        expect(result).toBe('2026-01-04');
    });
});

describe('easternMinutesSinceMidnight', () => {
    it('easternMinutesSinceMidnight_easternNoon_returnsSevenTwenty', () => {
        // Arrange
        const epochMs = Date.UTC(2026, 0, 5, 17, 0, 0);

        // Act
        const result = easternMinutesSinceMidnight(epochMs);

        // Assert
        expect(result).toBe(720);
    });

    it('easternMinutesSinceMidnight_easternMidnight_returnsZero', () => {
        // Arrange
        const epochMs = Date.UTC(2026, 0, 5, 5, 0, 0);

        // Act
        const result = easternMinutesSinceMidnight(epochMs);

        // Assert
        expect(result).toBe(0);
    });
});

describe('isMondayEastern', () => {
    it('isMondayEastern_mondayInstant_returnsTrue', () => {
        // Arrange
        const epochMs = Date.UTC(2026, 0, 5, 17, 0, 0);

        // Act
        const result = isMondayEastern(epochMs);

        // Assert
        expect(result).toBe(true);
    });

    it('isMondayEastern_tuesdayInstant_returnsFalse', () => {
        // Arrange
        const epochMs = Date.UTC(2026, 0, 6, 17, 0, 0);

        // Act
        const result = isMondayEastern(epochMs);

        // Assert
        expect(result).toBe(false);
    });
});

describe('subtractCalendarDays', () => {
    it('subtractCalendarDays_withinMonth_returnsEarlierDate', () => {
        // Arrange
        const dateStr = '2026-01-05';

        // Act
        const result = subtractCalendarDays(dateStr, 3);

        // Assert
        expect(result).toBe('2026-01-02');
    });

    it('subtractCalendarDays_crossesMonthAndYear_returnsPreviousYear', () => {
        // Arrange
        const dateStr = '2026-01-02';

        // Act
        const result = subtractCalendarDays(dateStr, 5);

        // Assert
        expect(result).toBe('2025-12-28');
    });

    it('subtractCalendarDays_nonNumericComponents_throwsError', () => {
        // Arrange
        const dateStr = 'not-a-date';

        // Act & Assert
        expect(() => subtractCalendarDays(dateStr, 1)).toThrow('Invalid date string');
    });

    it('subtractCalendarDays_outOfRangeMonth_throwsError', () => {
        // Arrange
        const dateStr = '2026-13-01';

        // Act & Assert
        expect(() => subtractCalendarDays(dateStr, 1)).toThrow('Invalid date string');
    });

    it('subtractCalendarDays_nonIntegerDays_throwsError', () => {
        // Arrange
        const dateStr = '2026-01-05';

        // Act & Assert
        expect(() => subtractCalendarDays(dateStr, 1.5)).toThrow('days must be an integer');
    });
});
