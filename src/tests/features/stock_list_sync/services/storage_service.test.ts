import { StorageService } from '../../../../features/stock_list_sync/services/storage_service';
import * as admin from 'firebase-admin';

jest.mock('firebase-admin', () => {
    const mockSave = jest.fn();
    const mockFile = jest.fn(() => ({ save: mockSave }));
    const mockBucket = jest.fn(() => ({ file: mockFile }));
    const mockStorage = jest.fn(() => ({ bucket: mockBucket }));

    return {
        storage: mockStorage,
        initializeApp: jest.fn(),
        apps: [],
        credential: { applicationDefault: jest.fn() },
        _mockSave: mockSave,
        _mockFile: mockFile,
        _mockBucket: mockBucket
    };
});

describe('StorageService', () => {
    let service: StorageService;
    const mockAdmin = admin as unknown as {
        _mockSave: jest.Mock;
        _mockFile: jest.Mock;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        service = new StorageService();
    });

    it('should_uploadFileToStorage_withCorrectMetadata', async () => {
        // Arrange
        const stocks = [
            { s: 'AAPL', n: 'Apple' },
            { s: 'GOOG', n: 'Google' }
        ];

        // Act
        await service.saveStockList(stocks);

        expect(mockAdmin._mockFile).toHaveBeenCalledWith('system_data/stock_list.json');
        expect(mockAdmin._mockSave).toHaveBeenCalledWith(expect.stringContaining('"s":"AAPL"'), expect.objectContaining({
            gzip: true,
            contentType: 'application/json',
            metadata: {
                cacheControl: 'public, max-age=3600'
            }
        }));
    });
    it('should_throwError_when_fileSaveFails', async () => {
        // Arrange
        const stocks = [{ s: 'AAPL', n: 'Apple' }];
        const error = new Error('Upload Failed');
        mockAdmin._mockSave.mockRejectedValue(error);

        // Act & Assert
        await expect(service.saveStockList(stocks)).rejects.toThrow(error);
    });
});
