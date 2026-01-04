import { StockListSyncUseCase } from '../../../features/stock_list_sync/usecase';
import { FmpService } from '../../../features/stock_list_sync/services/fmp_service';
import { StorageService } from '../../../features/stock_list_sync/services/storage_service';

// Mock dependencies
jest.mock('../../../features/stock_list_sync/services/fmp_service');
jest.mock('../../../features/stock_list_sync/services/storage_service');

describe('StockListSyncUseCase', () => {
    let useCase: StockListSyncUseCase;
    let mockFmpService: jest.Mocked<FmpService>;
    let mockStorageService: jest.Mocked<StorageService>;

    beforeEach(() => {
        mockFmpService = new FmpService() as jest.Mocked<FmpService>;
        mockStorageService = new StorageService() as jest.Mocked<StorageService>;
        useCase = new StockListSyncUseCase(mockFmpService, mockStorageService);
    });

    it('should_orchestrateSync_successfully', async () => {
        // Arrange
        const mockStocks = [
            { symbol: 'AAPL', companyName: 'Apple Inc.' },
            { symbol: 'TSLA', companyName: 'Tesla Inc.' }
        ];
        mockFmpService.fetchAllStocks.mockResolvedValue(mockStocks);

        // Act
        await useCase.execute();

        // Assert
        expect(mockFmpService.fetchAllStocks).toHaveBeenCalled();

        const expectedMinified = [
            { s: 'AAPL', n: 'Apple Inc.' },
            { s: 'TSLA', n: 'Tesla Inc.' }
        ];
        expect(mockStorageService.saveStockList).toHaveBeenCalledWith(expectedMinified);
    });
    it('should_propagateError_when_fmpServiceFails', async () => {
        // Arrange
        const error = new Error('FMP API Error');
        mockFmpService.fetchAllStocks.mockRejectedValue(error);

        // Act & Assert
        await expect(useCase.execute()).rejects.toThrow(error);
        expect(mockStorageService.saveStockList).not.toHaveBeenCalled();
    });

    it('should_propagateError_when_storageServiceFails', async () => {
        // Arrange
        const mockStocks = [{ symbol: 'AAPL', companyName: 'Apple' }];
        mockFmpService.fetchAllStocks.mockResolvedValue(mockStocks);

        const error = new Error('Storage Upload Failed');
        mockStorageService.saveStockList.mockRejectedValue(error);

        // Act & Assert
        await expect(useCase.execute()).rejects.toThrow(error);
    });
});
