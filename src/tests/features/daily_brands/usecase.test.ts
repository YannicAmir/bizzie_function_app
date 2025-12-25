import { refreshDailyBrands, AIService, DBService, Product, DailyBrandsData } from '../../../features/daily_brands/usecase';

// Mocks
const mockGenerateSectorProducts = jest.fn();
const mockGenerateAllSectorsProducts = jest.fn();
const mockSetDailyContent = jest.fn();

const mockAIService: AIService = {
    generateSectorProducts: mockGenerateSectorProducts,
    generateAllSectorsProducts: mockGenerateAllSectorsProducts,
};

const mockDBService: DBService = {
    setDailyContent: mockSetDailyContent,
};

// Helpers
const createMockProduct = (name: string): Product => ({
    name,
    description: 'Description',
    ticker: 'TICK',
    company: 'Company',
});

describe('refreshDailyBrands', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('refreshDailyBrands_allGenerationsSucceed_savesCompleteData', async () => {
        // Arrange
        const mockProduct = createMockProduct('TestProduct');
        mockGenerateSectorProducts.mockResolvedValue([mockProduct]);
        mockGenerateAllSectorsProducts.mockResolvedValue([mockProduct]);

        // Act
        await refreshDailyBrands(mockAIService, mockDBService);

        // Assert
        // 11 Sectors + 1 "All Sectors" = 12
        expect(mockSetDailyContent).toHaveBeenCalledTimes(1);
        const storedData: DailyBrandsData = mockSetDailyContent.mock.calls[0][0];
        expect(storedData.sectors).toHaveLength(12);
        expect(storedData.sectors.find(s => s.name === 'Energy')?.products).toHaveLength(1);
        expect(storedData.sectors.find(s => s.name === 'All Sectors')?.products).toHaveLength(1);
    });

    test('refreshDailyBrands_singleSectorFails_continuesAndSavesPartialData', async () => {
        // Arrange
        mockGenerateSectorProducts.mockImplementation(async (sector: string) => {
            if (sector === 'Energy') {
                throw new Error('AI Error');
            }
            return [createMockProduct(`Product-${sector}`)];
        });
        mockGenerateAllSectorsProducts.mockResolvedValue([]);

        // Act
        await refreshDailyBrands(mockAIService, mockDBService);

        // Assert
        expect(mockSetDailyContent).toHaveBeenCalledTimes(1);
        const storedData: DailyBrandsData = mockSetDailyContent.mock.calls[0][0];
        // Energy should be empty
        expect(storedData.sectors.find(s => s.name === 'Energy')?.products).toHaveLength(0);
        // Others should have data (10 other sectors + All Sectors)
        expect(storedData.sectors.find(s => s.name === 'Materials')?.products).toHaveLength(1);
    });

    test('refreshDailyBrands_allSectorsGenerationFails_savesDataWithoutAllSectors', async () => {
        // Arrange
        mockGenerateSectorProducts.mockResolvedValue([createMockProduct('P')]);
        mockGenerateAllSectorsProducts.mockRejectedValue(new Error('AI All Sectors Error'));

        // Act
        await refreshDailyBrands(mockAIService, mockDBService);

        // Assert
        expect(mockSetDailyContent).toHaveBeenCalledTimes(1);
        const storedData: DailyBrandsData = mockSetDailyContent.mock.calls[0][0];
        // All Sectors should be empty
        expect(storedData.sectors.find(s => s.name === 'All Sectors')?.products).toHaveLength(0);
        // Standard sectors should be fine
        expect(storedData.sectors.find(s => s.name === 'Utilities')?.products).toHaveLength(1);
    });

    test('refreshDailyBrands_dbSaveFails_throwsError', async () => {
        // Arrange
        mockGenerateSectorProducts.mockResolvedValue([]);
        mockGenerateAllSectorsProducts.mockResolvedValue([]);
        mockSetDailyContent.mockRejectedValue(new Error('DB Connection Error'));

        // Act & Assert
        await expect(refreshDailyBrands(mockAIService, mockDBService))
            .rejects.toThrow('DB Connection Error');
    });
});
