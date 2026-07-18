import { selectCohort } from '../../../features/stock_price_sync/cohort';

const makeWatchlist = (tickers: string[]): Map<string, string> =>
    new Map(tickers.map((t) => [t, `${t} Inc.`]));

describe('selectCohort', () => {
    it('selectCohort_maxCallsPerRunZero_returnsAllEntries', () => {
        // Arrange
        const watchlist = makeWatchlist(['AAA', 'BBB', 'CCC']);

        // Act
        const result = selectCohort(watchlist, 0, 600);

        // Assert
        expect(result.map(([t]) => t)).toEqual(['AAA', 'BBB', 'CCC']);
    });

    it('selectCohort_watchlistFitsInOneCohort_returnsAllEntries', () => {
        // Arrange
        const watchlist = makeWatchlist(['AAA', 'BBB']);

        // Act
        const result = selectCohort(watchlist, 2, 600);

        // Assert
        expect(result.map(([t]) => t)).toEqual(['AAA', 'BBB']);
    });

    it('selectCohort_emptyWatchlist_returnsEmpty', () => {
        // Arrange
        const watchlist = makeWatchlist([]);

        // Act
        const result = selectCohort(watchlist, 2, 600);

        // Assert
        expect(result).toEqual([]);
    });

    it('selectCohort_multipleCohorts_returnsSortedSlotForMinute', () => {
        // Arrange — 4 tickers, 2 per run → 2 cohorts; minute 600 % 2 === slot 0
        const watchlist = makeWatchlist(['D', 'B', 'A', 'C']);

        // Act
        const result = selectCohort(watchlist, 2, 600);

        // Assert — sorted [A,B,C,D], slot 0 → indices 0 and 2
        expect(result.map(([t]) => t)).toEqual(['A', 'C']);
    });

    it('selectCohort_differentMinute_selectsOtherSlot', () => {
        // Arrange — same 2 cohorts; minute 601 % 2 === slot 1
        const watchlist = makeWatchlist(['D', 'B', 'A', 'C']);

        // Act
        const result = selectCohort(watchlist, 2, 601);

        // Assert — slot 1 → indices 1 and 3
        expect(result.map(([t]) => t)).toEqual(['B', 'D']);
    });
});
