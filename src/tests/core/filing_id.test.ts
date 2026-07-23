import { filingDedupeId } from '../../core/filing_id';
import { SecFiling } from '../../core/services/sec_service';

const baseFiling: SecFiling = {
    symbol: 'AAPL',
    filingDate: '2026-07-22',
    acceptedDate: '2026-07-22T16:30:00Z',
    formType: '8-K',
    link: 'https://www.sec.gov/index.json',
    finalLink: 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000001.htm',
    cik: '0000320193'
};

describe('filingDedupeId', () => {
    it('filingDedupeId_validFiling_returnsSha256HexString', () => {
        // Arrange
        const filing = { ...baseFiling };

        // Act
        const result = filingDedupeId(filing);

        // Assert
        expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('filingDedupeId_sameInput_returnsIdenticalHash', () => {
        // Arrange
        const filing = { ...baseFiling };

        // Act
        const first = filingDedupeId(filing);
        const second = filingDedupeId({ ...filing });

        // Assert
        expect(first).toBe(second);
    });

    it('filingDedupeId_differentSymbol_returnsDifferentHash', () => {
        // Arrange
        const filing = { ...baseFiling };
        const other = { ...baseFiling, symbol: 'MSFT' };

        // Act
        const result = filingDedupeId(filing);
        const otherResult = filingDedupeId(other);

        // Assert
        expect(result).not.toBe(otherResult);
    });

    it('filingDedupeId_differentFinalLink_returnsDifferentHash', () => {
        // Arrange
        const filing = { ...baseFiling };
        const other = { ...baseFiling, finalLink: 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000002.htm' };

        // Act
        const result = filingDedupeId(filing);
        const otherResult = filingDedupeId(other);

        // Assert
        expect(result).not.toBe(otherResult);
    });

    it('filingDedupeId_emptyFinalLink_throwsError', () => {
        // Arrange
        const filing = { ...baseFiling, finalLink: '' };

        // Act & Assert
        expect(() => filingDedupeId(filing)).toThrow('finalLink is empty');
    });
});
