import { easternDateString, easternTimestampString } from '../../core/time';

describe('easternDateString', () => {
    it('easternDateString_utcNextDay_returnsEasternDate', () => {
        // Arrange
        const instant = new Date('2026-07-23T01:30:00Z');

        // Act
        const result = easternDateString(instant);

        // Assert
        expect(result).toBe('2026-07-22');
    });

    it('easternDateString_middayUtc_returnsSameEasternDate', () => {
        // Arrange
        const instant = new Date('2026-07-22T16:00:00Z');

        // Act
        const result = easternDateString(instant);

        // Assert
        expect(result).toBe('2026-07-22');
    });
});

describe('easternTimestampString', () => {
    it('easternTimestampString_utcNextDay_returnsEasternTimestamp', () => {
        // Arrange
        const instant = new Date('2026-07-23T01:30:00Z');

        // Act
        const result = easternTimestampString(instant);

        // Assert
        expect(result).toBe('2026-07-22 21:30:00');
    });

    it('easternTimestampString_format_matchesFmpAcceptedDateShape', () => {
        // Arrange
        const instant = new Date('2026-07-22T20:01:36Z');

        // Act
        const result = easternTimestampString(instant);

        // Assert
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
        expect(result).toBe('2026-07-22 16:01:36');
    });
});
