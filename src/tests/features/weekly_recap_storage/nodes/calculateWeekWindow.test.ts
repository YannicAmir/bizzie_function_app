import { makeCalculateWeekWindowNode } from '../../../../features/weekly_recap/storage/nodes/calculateWeekWindow';

describe('calculateWeekWindowNode', () => {
    const FIXED_NOW = new Date('2026-05-15T12:00:00.000Z');

    beforeEach(() => {
        // Arrange
        jest.useFakeTimers().setSystemTime(FIXED_NOW);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('calculateWeekWindowNode_called_returnsEndDateAsNow', async () => {
        // Arrange
        const node = makeCalculateWeekWindowNode();

        // Act
        const result = await node({} as never);

        // Assert
        expect(result.endDate).toBe('2026-05-15');
    });

    it('calculateWeekWindowNode_called_returnsStartDateSevenDaysBeforeNow', async () => {
        // Arrange
        const node = makeCalculateWeekWindowNode();
        const expectedStart = '2026-05-08';

        // Act
        const result = await node({} as never);

        // Assert
        expect(result.startDate).toBe(expectedStart);
    });

    it('calculateWeekWindowNode_called_startAndEndDifferBySevenDays', async () => {
        // Arrange
        const node = makeCalculateWeekWindowNode();

        // Act
        const result = await node({} as never);

        // Assert
        const diffMs = new Date(result.endDate!).getTime() - new Date(result.startDate!).getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        expect(diffDays).toBe(7);
    });
});
