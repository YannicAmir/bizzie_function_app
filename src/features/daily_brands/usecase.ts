import { Logger } from '../../core/logger';

const _logger = new Logger("Daily Brands UseCase");

export interface Product {
    name: string;
    description: string;
    ticker: string;
    company: string;
}

export interface Sector {
    name: string;
    products: Product[];
}

export interface DailyBrandsData {
    date: string;
    sectors: Sector[];
}

export interface AIService {
    generateSectorProducts(sectorName: string): Promise<Product[]>;
    generateAllSectorsProducts(excludedProducts: Product[]): Promise<Product[]>;
}

export interface DBService {
    setDailyContent(data: DailyBrandsData): Promise<void>;
}

export const refreshDailyBrands = async (
    aiService: AIService,
    dbService: DBService,
    sectors: string[]
): Promise<void> => {
    _logger.info("Starting Refresh...");

    const sectorPromises = sectors.map(async (sectorName) => {
        try {
            const products = await aiService.generateSectorProducts(sectorName);
            return { name: sectorName, products };
        } catch (error) {
            _logger.error(`Failed to generate products for sector ${sectorName}:`, error);
            return { name: sectorName, products: [] };
        }
    });

    const sectorsData = await Promise.all(sectorPromises);

    const allGeneratedProducts = sectorsData.flatMap(s => s.products);

    let allSectorsProducts: Product[] = [];
    try {
        allSectorsProducts = await aiService.generateAllSectorsProducts(allGeneratedProducts);
    } catch (error) {
        _logger.error("Failed to generate 'All Sectors' products:", error);
    }

    const allSectorsParams: Sector = {
        name: "All Sectors",
        products: allSectorsProducts
    };

    const dailyData: DailyBrandsData = {
        date: new Date().toISOString(),
        sectors: [
            ...sectorsData,
            allSectorsParams
        ]
    };

    await dbService.setDailyContent(dailyData);
    _logger.info("Refresh Completed Successfully.");
};
