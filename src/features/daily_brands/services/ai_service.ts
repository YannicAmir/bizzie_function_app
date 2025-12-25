import { AIService, Product } from '../usecase';
import { getGeminiModel } from '../../../core/vertex-ai';
import { retry } from '../../../core/retry';
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

export class ValidatedAIService implements AIService {
  private model = getGeminiModel();

  async generateSectorProducts(sectorName: string): Promise<Product[]> {
    const prompt = `
      Generate 6 popular products for the stock market sector "${sectorName}".
      Function: Return ONLY strictly popular products manufactured or sold by public companies in this sector.
      
      Output Schema (JSON):
      {
        "products": [
          { "name": "Product Name", "description": "Short description", "ticker": "TICK", "company": "Company Name" }
        ]
      }
    `;

    return this.generateAndParse(prompt);
  }

  async generateAllSectorsProducts(excludedProducts: Product[]): Promise<Product[]> {
    const excludedNames = excludedProducts.map(p => p.name).join(", ").slice(0, 1000); // Truncate to avoid token limits if necessary

    const prompt = `
      Generate 6 popular products from public companies that are NOT in this list of excluded products.
      Excluded items: ${excludedNames}... (and similar items).
      
      Focus: These should be "All Sectors" picks - popular items from any stock market sector, but distinct from the specific sector lists already generated.
      
      Output Schema (JSON):
      {
        "products": [
          { "name": "Product Name", "description": "Short description", "ticker": "TICK", "company": "Company Name" }
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
          console.warn("AI Generation attempt failed:", error);
          throw error; // Ensure retry catches it
        }
      }, {
        maxAttempts: 3,
        initialDelayMs: 2000,
        backoffFactor: 2
      });
    } catch (error) {
      console.error("AI Generation Error:", error);
      throw error;
    }
  }
}
