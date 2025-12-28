import { Logger } from '../../core/logger';

const _logger = new Logger("Daily Brands UseCase");

export interface Product {
    name: string;
    description: string;
    ticker: string; // Stock ticker symbol
    company: string; // Company name
}

export interface Sector {
    name: string;
    products: Product[];
}

export interface DailyBrandsData {
    date: string; // ISO date string for reference
    sectors: Sector[];
}

export interface AIService {
    generateSectorProducts(sectorName: string): Promise<Product[]>;
    generateAllSectorsProducts(excludedProducts: Product[]): Promise<Product[]>;
}

export interface DBService {
    setDailyContent(data: DailyBrandsData): Promise<void>;
}

// ...

export const refreshDailyBrands = async (
    aiService: AIService,
    dbService: DBService,
    sectors: string[]
): Promise<void> => {
    _logger.info("Starting Refresh...");

    // 1. Generate core sectors in parallel
    const sectorPromises = sectors.map(async (sectorName) => {
        try {
            const products = await aiService.generateSectorProducts(sectorName);
            return { name: sectorName, products };
        } catch (error) {
            _logger.error(`Failed to generate products for sector ${sectorName}:`, error);
            // Return empty products for this sector rather than failing the whole batch
            // This allows partial success
            return { name: sectorName, products: [] };
        }
    });

    const sectorsData = await Promise.all(sectorPromises);

    // 2. Aggregate all products to create the exclusion list
    const allGeneratedProducts = sectorsData.flatMap(s => s.products);

    // 3. Generate "All Sectors" products, excluding the above
    let allSectorsProducts: Product[] = [];
    try {
        allSectorsProducts = await aiService.generateAllSectorsProducts(allGeneratedProducts);
    } catch (error) {
        _logger.error("Failed to generate 'All Sectors' products:", error);
        // Continue with empty list if this specific part fails
    }

    const allSectorsParams: Sector = {
        name: "All Sectors",
        products: allSectorsProducts
    };

    // 4. Construct the final data object
    const dailyData: DailyBrandsData = {
        date: new Date().toISOString(),
        sectors: [
            ...sectorsData,
            allSectorsParams
        ]
    };

    // 5. Save to Database
    await dbService.setDailyContent(dailyData);
    _logger.info("Refresh Completed Successfully.");
};
