import { buildFinalizedSnapshot, buildIntradaySnapshot, SnapshotInput } from '../../../features/stock_price_sync/snapshot';
import { IntradayBar } from '../../../features/stock_price_sync/models/IntradayBar';

const TODAY = '2026-01-06';

const makeBar = (date: string, close: number): IntradayBar => ({
    date,
    open: close,
    low: close,
    high: close,
    close,
    volume: 100
});

const makeInput = (overrides: Partial<SnapshotInput> = {}): SnapshotInput => ({
    ticker: 'AAA',
    companyName: 'Alpha Inc.',
    bars: [makeBar('2026-01-06 09:30:00', 102), makeBar('2026-01-06 09:31:00', 104)],
    previousClose: 100,
    today: TODAY,
    bucketMinutes: 5,
    ...overrides
});

describe('buildIntradaySnapshot', () => {
    it('buildIntradaySnapshot_todayBars_returnsSnapshotWithLatestClose', () => {
        // Arrange
        const input = makeInput({
            bars: [
                makeBar('2026-01-05 15:59:00', 90),
                makeBar('2026-01-06 09:30:00', 102),
                makeBar('2026-01-06 09:31:00', 104)
            ]
        });

        // Act
        const result = buildIntradaySnapshot(input);

        // Assert
        expect(result).toEqual({
            ticker: 'AAA',
            companyName: 'Alpha Inc.',
            price: 104,
            previousClose: 100,
            change: 4,
            changePercent: 4,
            sessionDate: TODAY,
            series: [{ t: '09:31', c: 104 }],
            latestBarAt: '2026-01-06 09:31:00',
            closeFinalized: false
        });
    });

    it('buildIntradaySnapshot_noTodayBars_returnsNull', () => {
        // Arrange
        const input = makeInput({ bars: [makeBar('2026-01-05 15:59:00', 90)] });

        // Act
        const result = buildIntradaySnapshot(input);

        // Assert
        expect(result).toBeNull();
    });

    it('buildIntradaySnapshot_nullPreviousClose_returnsNullChange', () => {
        // Arrange
        const input = makeInput({ previousClose: null });

        // Act
        const result = buildIntradaySnapshot(input);

        // Assert
        expect(result).toEqual(
            expect.objectContaining({ price: 104, previousClose: null, change: null, changePercent: null })
        );
    });

    it('buildIntradaySnapshot_zeroPreviousClose_returnsNullChange', () => {
        // Arrange
        const input = makeInput({ previousClose: 0 });

        // Act
        const result = buildIntradaySnapshot(input);

        // Assert
        expect(result).toEqual(
            expect.objectContaining({ price: 104, previousClose: 0, change: null, changePercent: null })
        );
    });

    it('buildIntradaySnapshot_multipleBarsPerBucket_keepsNewestPerBucket', () => {
        // Arrange
        const input = makeInput({
            bars: [
                makeBar('2026-01-06 09:30:00', 102),
                makeBar('2026-01-06 09:31:00', 104),
                makeBar('2026-01-06 09:35:00', 106)
            ]
        });

        // Act
        const result = buildIntradaySnapshot(input);

        // Assert
        expect(result?.series).toEqual([{ t: '09:31', c: 104 }, { t: '09:35', c: 106 }]);
        expect(result?.price).toBe(106);
    });

    it('buildIntradaySnapshot_unsortedBars_sortsBeforeDerivation', () => {
        // Arrange
        const input = makeInput({
            bucketMinutes: 1,
            bars: [
                makeBar('2026-01-06 09:32:00', 105),
                makeBar('2026-01-06 09:30:00', 102),
                makeBar('2026-01-06 09:31:00', 104)
            ]
        });

        // Act
        const result = buildIntradaySnapshot(input);

        // Assert
        expect(result?.latestBarAt).toBe('2026-01-06 09:32:00');
        expect(result?.price).toBe(105);
        expect(result?.series).toEqual([
            { t: '09:30', c: 102 },
            { t: '09:31', c: 104 },
            { t: '09:32', c: 105 }
        ]);
    });
});

describe('buildFinalizedSnapshot', () => {
    it('buildFinalizedSnapshot_officialClose_overridesPriceAndAppendsClosePoint', () => {
        // Arrange
        const input = makeInput({
            bars: [makeBar('2026-01-06 09:30:00', 102), makeBar('2026-01-06 15:59:00', 108)]
        });

        // Act
        const result = buildFinalizedSnapshot(input, 110);

        // Assert
        expect(result).toEqual({
            ticker: 'AAA',
            companyName: 'Alpha Inc.',
            price: 110,
            previousClose: 100,
            change: 10,
            changePercent: 10,
            sessionDate: TODAY,
            series: [{ t: '09:30', c: 102 }, { t: '15:59', c: 108 }, { t: '16:00', c: 110 }],
            latestBarAt: '2026-01-06 15:59:00',
            closeFinalized: true
        });
    });

    it('buildFinalizedSnapshot_seriesTipEqualsOfficialClose', () => {
        // Arrange
        const input = makeInput();

        // Act
        const result = buildFinalizedSnapshot(input, 120);

        // Assert
        expect(result?.series[result.series.length - 1]).toEqual({ t: '16:00', c: 120 });
        expect(result?.price).toBe(120);
    });

    it('buildFinalizedSnapshot_noTodayBars_returnsNull', () => {
        // Arrange
        const input = makeInput({ bars: [makeBar('2026-01-05 15:59:00', 90)] });

        // Act
        const result = buildFinalizedSnapshot(input, 110);

        // Assert
        expect(result).toBeNull();
    });
});
