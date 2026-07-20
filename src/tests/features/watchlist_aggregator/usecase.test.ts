import { WatchlistAggregatorUseCase } from '../../../features/watchlist_aggregator/usecase';
import { GlobalWatchlistService } from '../../../features/watchlist_aggregator/services/global_watchlist_service';

describe('WatchlistAggregatorUseCase', () => {
    let useCase: WatchlistAggregatorUseCase;
    let mockGlobalWatchlistService: jest.Mocked<GlobalWatchlistService>;

    beforeEach(() => {
        mockGlobalWatchlistService = {
            upsertToGlobalList: jest.fn(),
        } as unknown as jest.Mocked<GlobalWatchlistService>;

        useCase = new WatchlistAggregatorUseCase(mockGlobalWatchlistService);
    });

    it('watchlistAggregatorUseCase_execute_upsertsToGlobalList', async () => {
        // Arrange
        const ticker = 'AAPL';
        const companyName = 'Apple Inc.';
        const logoUrl = 'https://images.financialmodelingprep.com/symbol/AAPL.png';

        // Act
        await useCase.execute(ticker, companyName, logoUrl);

        // Assert
        expect(mockGlobalWatchlistService.upsertToGlobalList).toHaveBeenCalledWith(ticker, companyName, logoUrl);
    });

    it('watchlistAggregatorUseCase_execute_missingTicker_doesNotCallService', async () => {
        // Arrange
        const ticker = '';
        const companyName = 'Apple Inc.';

        // Act
        await useCase.execute(ticker, companyName, '');

        // Assert
        expect(mockGlobalWatchlistService.upsertToGlobalList).not.toHaveBeenCalled();
    });

    it('watchlistAggregatorUseCase_execute_missingName_stillCallsService', async () => {
        // Arrange
        const ticker = 'AAPL';
        const companyName = '';

        // Act
        await useCase.execute(ticker, companyName, '');

        // Assert
        expect(mockGlobalWatchlistService.upsertToGlobalList).toHaveBeenCalledWith(ticker, companyName, '');
    });
});
