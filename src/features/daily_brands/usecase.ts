
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

// The 11 Stock Market Sectors (GICS)
const SECTORS = [
    "Energy",
    "Materials",
    "Industrials",
    "Consumer Discretionary",
    "Consumer Staples",
    "Health Care",
    "Financials",
    "Information Technology",
    "Communication Services",
    "Utilities",
    "Real Estate"
];

export const refreshDailyBrands = async (
    aiService: AIService,
    dbService: DBService
): Promise<void> => {
    console.log("Starting Daily Brands Refresh...");

    // 1. Generate core sectors in parallel
    const sectorPromises = SECTORS.map(async (sectorName) => {
        try {
            const products = await aiService.generateSectorProducts(sectorName);
            return { name: sectorName, products };
        } catch (error) {
            console.error(`Failed to generate products for sector ${sectorName}:`, error);
            // Return empty products for this sector rather than failing the whole batch
            // This allows partial success
            return { name: sectorName, products: [] };
        }
    });

    const sectors = await Promise.all(sectorPromises);

    // 2. Aggregate all products to create the exclusion list
    const allGeneratedProducts = sectors.flatMap(s => s.products);

    // 3. Generate "All Sectors" products, excluding the above
    let allSectorsProducts: Product[] = [];
    try {
        allSectorsProducts = await aiService.generateAllSectorsProducts(allGeneratedProducts);
    } catch (error) {
        console.error("Failed to generate 'All Sectors' products:", error);
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
            ...sectors,
            allSectorsParams
        ]
    };

    // 5. Save to Database
    await dbService.setDailyContent(dailyData);
    console.log("Daily Brands Refresh Completed Successfully.");
};
