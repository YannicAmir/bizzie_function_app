import { AIService, Product } from '../usecase';
import { getGeminiModel } from '../../../core/vertex-ai';
import { retry } from '../../../core/retry';
import { Logger } from '../../../core/logger';
import { z } from 'zod';

const ProductSchema = z.object({
  name: z.string(),
  description: z.string(),
  ticker: z.string(),
  company: z.string(),
});

const ResponseSchema = z.object({
  products: z.array(ProductSchema),
});

const _logger = new Logger("Daily Brands AI Service");

export class ValidatedAIService implements AIService {
  private model;

  constructor(modelName: string) {
    this.model = getGeminiModel(modelName);
  }

  async generateSectorProducts(sectorName: string): Promise<Product[]> {
    const prompt = `
      Task: Generate a list of 6 products for the sector "${sectorName}".
      
      SELECTION LOGIC (Heirarchy):
      1. First, identify the **6 most popular/valuable PUBLICLY TRADED US COMPANIES** in this sector (the market leaders).
      2. Then, for each of these 6 companies, select their **most popular/iconic consumer product**.
      3. Result: You should return exactly 6 products (one from each of the top 6 companies).

      CRITICAL PRODUCT NAME RULES:
      1. **NO GENERIC NAMES**: Do NOT use generic terms like "Gasoline", "Smartphone", or "Coffee".
      2. **USE BRANDED NAMES**: Use the specific consumer-facing brand name.
         - Bad: "Gasoline", "Plane Ticket", "Soda"
         - Good: "Chevron Techron", "Delta Comfort+", "Coca-Cola Zero Sugar"
      3. **USER FRIENDLY**: The name must be easily recognized by the general public.

      CRITICAL TICKER RULES:
      1. Use ONLY US Stock Market Tickers (NYSE/NASDAQ) for the parent company.
      2. Do NOT use Futures symbols (e.g., "CL=F", "GC=F").
      3. Do NOT use Commodity codes.
      4. Example: For "ExxonMobil", use "XOM". For "Chevron", use "CVX".
      5. **FILTER OUT** any product if the company is PRIVATE or NOT listed on a US exchange. Do not return it.

      Output Schema (JSON):
      {
        "products": [
          { "name": "Specific Brand Name", "description": "Short description", "ticker": "TICK", "company": "Company Name" }
        ]
      }
    `;

    return this.generateAndParse(prompt);
  }

  async generateAllSectorsProducts(excludedProducts: Product[]): Promise<Product[]> {
    const excludedNames = excludedProducts.map(p => p.name).join(", ").slice(0, 1000); // Truncate to avoid token limits if necessary

    const prompt = `
      Task: Generate a list of 6 popular products from major US companies.
      Excluded items: ${excludedNames}... (and similar items).
      
      SELECTION LOGIC (Heirarchy):
      1. Identify **6 most popular/valuable PUBLICLY TRADED US COMPANIES** (from *any* sector) that are NOT in the excluded list.
      2. For each, select their **most popular/iconic consumer product**.
      3. The goal is "All Sectors" picks - major household names different from the sector-specific ones.
      
      CRITICAL PRODUCT NAME RULES:
      1. **NO GENERIC NAMES**: Do NOT use generic terms like "Gasoline", "Smartphone", or "Coffee".
      2. **USE BRANDED NAMES**: Use the specific consumer-facing brand name.
         - Bad: "Gasoline", "Plane Ticket", "Soda"
         - Good: "Chevron Techron", "Delta Comfort+", "Coca-Cola Zero Sugar"
      3. **USER FRIENDLY**: The name must be easily recognized by the general public.

      CRITICAL EXCLUSION RULES:
      1. **NO ALCOHOL**: Do NOT return alcoholic beverages or companies related to alcohol (spirits, beer, wine).
      2. **NO TOBACCO**: Do NOT return tobacco products or companies related to tobacco (cigarettes, vapes, cigars).
      3. If a top company primarily sells these (e.g., Philip Morris), search for a non-restricted subsidiary product or SKIP the company entirely and pick the next most popular one.

      CRITICAL TICKER RULES:
      1. Use ONLY US Stock Market Tickers (NYSE/NASDAQ) for the parent company.
      2. Do NOT use Futures symbols (e.g., "CL=F", "GC=F").
      3. Do NOT use Commodity codes.
      4. Example: For "ExxonMobil", use "XOM". For "Chevron", use "CVX".
      5. **FILTER OUT** any product if the company is PRIVATE or NOT listed on a US exchange. Do not return it.

      Output Schema (JSON):
      {
        "products": [
          { "name": "Specific Brand Name", "description": "Short description", "ticker": "TICK", "company": "Company Name" }
        ]
      }
    `;

    return this.generateAndParse(prompt);
  }

  private async generateAndParse(prompt: string): Promise<Product[]> {
    try {
      return await retry(async () => {
        try {
          const result = await this.model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          });

          const candidate = result.response.candidates?.[0];
          const responseText = candidate?.content?.parts?.[0]?.text;

          if (!responseText) {
            throw new Error("Empty response from AI");
          }

          const json = JSON.parse(responseText);
          const parsed = ResponseSchema.parse(json);

          return parsed.products;
        } catch (error) {
          _logger.warn("Generation attempt failed:", { error });
          throw error; // Ensure retry catches it
        }
      }, {
        maxAttempts: 3,
        initialDelayMs: 2000,
        backoffFactor: 2
      });
    } catch (error) {
      _logger.error("Generation Error:", error);
      throw error;
    }
  }
}
