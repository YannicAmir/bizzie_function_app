import { resolvePhase } from '../../../features/stock_price_sync/phase';

describe('resolvePhase', () => {
    it('resolvePhase_beforeSeedWindow_returnsIdle', () => {
        // Arrange
        const minuteOfDay = 554;

        // Act
        const result = resolvePhase(minuteOfDay);

        // Assert
        expect(result).toBe('idle');
    });

    it('resolvePhase_seedWindow_returnsSeed', () => {
        // Arrange
        const openEdge = 555;
        const closeEdge = 569;

        // Act & Assert
        expect(resolvePhase(openEdge)).toBe('seed');
        expect(resolvePhase(closeEdge)).toBe('seed');
    });

    it('resolvePhase_marketWindow_returnsIntraday', () => {
        // Arrange
        const openEdge = 570;
        const closeEdge = 965;

        // Act & Assert
        expect(resolvePhase(openEdge)).toBe('intraday');
        expect(resolvePhase(closeEdge)).toBe('intraday');
    });

    it('resolvePhase_betweenIntradayAndFinalize_returnsIdle', () => {
        // Arrange
        const afterIntraday = 966;
        const beforeFinalize = 979;

        // Act & Assert
        expect(resolvePhase(afterIntraday)).toBe('idle');
        expect(resolvePhase(beforeFinalize)).toBe('idle');
    });

    it('resolvePhase_finalizeWindow_returnsFinalize', () => {
        // Arrange
        const openEdge = 980;
        const closeEdge = 1019;

        // Act & Assert
        expect(resolvePhase(openEdge)).toBe('finalize');
        expect(resolvePhase(closeEdge)).toBe('finalize');
    });

    it('resolvePhase_afterFinalizeWindow_returnsIdle', () => {
        // Arrange
        const minuteOfDay = 1020;

        // Act
        const result = resolvePhase(minuteOfDay);

        // Assert
        expect(result).toBe('idle');
    });
});
