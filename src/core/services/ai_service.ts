import { getGeminiModel } from '../vertex-ai';
import { getRemoteConfig } from '../remote-config';
import { Logger } from '../logger';
import { retry } from '../retry';

const _logger = new Logger('AI Service');

export interface Enriched8kData {
    topic: string;
    summary: string;
    revenue?: string | null;
    eps?: string | null;
    sentiment: 'Positive' | 'Negative' | 'Neutral';
    isEarnings: boolean;
}

export interface EnrichedFinancialData {
    revenue: string | null;
    eps: string | null;
    summary: string;
}

export interface AiService {
    enrich8k(text: string): Promise<Enriched8kData | null>;
    enrichFinancialReport(text: string, formType: string): Promise<EnrichedFinancialData | null>;
}

export class VertexAiService implements AiService {

    async enrich8k(text: string): Promise<Enriched8kData | null> {
        return retry(async () => {
            try {
                const config = await getRemoteConfig();
                const modelName = config.modelName || 'gemini-3-flash-preview';
                const model = getGeminiModel(modelName);

                const prompt = `
                You are a financial analyst. Analyze the following text from an SEC 8-K filing.
                
                STRICT FILTERING RULES:
                You must classify the filing into EXACTLY ONE of the following topics. If it does not fit these topics, RETURN NULL.
                Topics:
                1. "M&A" (Buying or selling a company/division)
                2. "Earnings" (Earnings releases, financial results)
                3. "Delisting" (Notice of Delisting or Failure to Satisfy a Continued Listing Rule)
                4. "Restatement" (Non-Reliance on Previously Issued Financial Statements)
                5. "Executive Change" (Hiring/Firing C-Suite or Board)
                6. "Change in Control" (A buyout or hostile takeover success)
                7. "Bankruptcy"
                8. "New Agreement" (Entry into a Material Definitive Agreement - Signing a major contract)
                9. "Terminated Agreement" (Termination of a Material Definitive Agreement - Losing a major contract)

                Output JSON strictly.
                Format:
                {
                   "topic": "The Topic Name (e.g. Earnings, M&A) or null if invalid",
                   "isEarnings": boolean,
                   "summary": "Start with the company name. Specific, punchy tagline citing key details (e.g. 'Apple announced a $50M deal'). Max 20 words. Use simple, easy to understand language.",
                   "revenue": "Extracted revenue number (e.g. $25.2B) OR null",
                   "eps": "Extracted EPS number (e.g. $0.72/share) OR null",
                   "sentiment": "Positive" | "Negative" | "Neutral"
                }

                If the text is just boilerplate or doesn't match the topics, set "topic": null.

                TEXT:
                ${text.substring(0, 30000)} 
                `;

                const result = await model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: 'application/json' }
                });

                const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!responseText) {
                    _logger.warn("AI returned empty response");
                    return null;
                }

                const data = JSON.parse(responseText);

                if (!data.topic) {
                    _logger.info("AI determined filing is irrelevant (No matching topic).");
                    return null;
                }

                return {
                    topic: data.topic,
                    summary: data.summary,
                    revenue: data.revenue || null,
                    eps: data.eps || null,
                    sentiment: data.sentiment || 'Neutral',
                    isEarnings: !!data.isEarnings
                };

            } catch (error) {
                _logger.error("Error calling AI service", error);
                throw error; // Rethrow for retry logic
            }
        }, { maxAttempts: 3, backoffFactor: 2 });
    }

    async enrichFinancialReport(text: string, formType: string): Promise<EnrichedFinancialData | null> {
        return retry(async () => {
            try {
                const config = await getRemoteConfig();
                // Reuse the same model for now, or add a new config param like 'modelNameFinancials'
                const modelName = config.modelName || 'gemini-3-flash-preview';
                const model = getGeminiModel(modelName);

                const prompt = `
                You are a financial analyst. Analyze the following text from an SEC ${formType} filing.
                
                GOAL: Extract key financial metrics and provide a performance summary.

                if 10-Q is provided, focus STRICTLY on the columns labeled 'Three Months Ended [Current Period]'. Do NOT extract data from the 'Nine Months Ended' columns.

                EXTRACT:
                1. "revenue": The total revenue for the period (e.g. "$25.2B").
                2. "eps": Diluted Earnings Per Share (e.g. "$0.72/share").
                3. "summary": A 1-sentence summary explaining WHY the financial performance was up or down. 
                   - Focus on the "Results of Operations" or "Management's Discussion". 
                   - e.g., "Revenue increased 16% due to record iPhone 15 sales." 
                   - e.g., "Net income fell due to higher R&D costs and legal settlements."
                   - Max 25 words. Simple language.

                Output JSON strictly.
                Format:
                {
                   "revenue": "string OR null",
                   "eps": "string OR null",
                   "summary": "string"
                }

                TEXT:
                ${text.substring(0, 1500000)}
                `;
                // Note: We send up to 500k chars here (approx 125k tokens). 
                // The caller (SecService) will strip HTML and handle the main truncation. 
                // We add a safety substring here just in case.

                const result = await model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: 'application/json' }
                });

                const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!responseText) {
                    _logger.warn("AI returned empty response for financial report");
                    return null;
                }

                const data = JSON.parse(responseText);

                return {
                    revenue: data.revenue || null,
                    eps: data.eps || null,
                    summary: data.summary || `${formType} analyzed.`
                };

            } catch (error) {
                _logger.error(`Error analyzing ${formType}`, error);
                throw error;
            }
        }, { maxAttempts: 3, backoffFactor: 2 });
    }
}
