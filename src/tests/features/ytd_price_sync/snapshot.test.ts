import { buildYtdSnapshot, YtdSnapshotInput } from '../../../features/ytd_price_sync/snapshot';
import { EodClose } from '../../../features/ytd_price_sync/models/EodClose';

const eod = (date: string, close: number): EodClose => ({ date, close });

const makeInput = (overrides: Partial<YtdSnapshotInput> = {}): YtdSnapshotInput => ({
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    year: 2026,
    closes: [eod('2025-12-31', 100), eod('2026-01-02', 110), eod('2026-07-15', 130)],
    ...overrides
});

describe('buildYtdSnapshot', () => {

    it('buildYtdSnapshot_emptyCloses_returnsNull', () => {
        // Arrange
        const input = makeInput({ closes: [] });

        // Act
        const result = buildYtdSnapshot(input);

        // Assert
        expect(result).toBeNull();
    });

    it('buildYtdSnapshot_baselineBeforeYearStart_computesFromPriorYearClose', () => {
        // Arrange
        const input = makeInput();

        // Act
        const result = buildYtdSnapshot(input);

        // Assert
        expect(result).toEqual({
            ticker: 'AAPL',
            companyName: 'Apple Inc.',
            year: 2026,
            baselineDate: '2025-12-31',
            baselineClose: 100,
            latestDate: '2026-07-15',
            latestClose: 130,
            ytdChange: 30,
            ytdChangePercent: 30
        });
    });

    it('buildYtdSnapshot_noCloseBeforeYearStart_fallsBackToEarliestClose', () => {
        // Arrange
        const input = makeInput({
            closes: [eod('2026-01-02', 200), eod('2026-03-01', 240), eod('2026-07-15', 260)]
        });

        // Act
        const result = buildYtdSnapshot(input);

        // Assert
        expect(result).toEqual(expect.objectContaining({
            baselineDate: '2026-01-02',
            baselineClose: 200,
            latestDate: '2026-07-15',
            latestClose: 260,
            ytdChange: 60,
            ytdChangePercent: 30
        }));
    });

    it('buildYtdSnapshot_negativeChange_returnsNegativePercent', () => {
        // Arrange
        const input = makeInput({
            closes: [eod('2025-12-31', 100), eod('2026-07-15', 75)]
        });

        // Act
        const result = buildYtdSnapshot(input);

        // Assert
        expect(result).toEqual(expect.objectContaining({
            baselineClose: 100,
            latestClose: 75,
            ytdChange: -25,
            ytdChangePercent: -25
        }));
    });

    it('buildYtdSnapshot_zeroBaselineClose_returnsNull', () => {
        // Arrange
        const input = makeInput({
            closes: [eod('2025-12-31', 0), eod('2026-07-15', 130)]
        });

        // Act
        const result = buildYtdSnapshot(input);

        // Assert
        expect(result).toBeNull();
    });

    it('buildYtdSnapshot_unorderedCloses_picksCorrectBaselineAndLatest', () => {
        // Arrange
        const input = makeInput({
            closes: [eod('2026-07-15', 130), eod('2025-12-31', 100), eod('2026-01-02', 110)]
        });

        // Act
        const result = buildYtdSnapshot(input);

        // Assert
        expect(result).toEqual(expect.objectContaining({
            baselineDate: '2025-12-31',
            baselineClose: 100,
            latestDate: '2026-07-15',
            latestClose: 130
        }));
    });
});
