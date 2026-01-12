import { getGeminiModel } from '../vertex-ai';
import { getRemoteConfig } from '../remote-config';
import { Logger } from '../logger';
import { retry } from '../retry';

const _logger = new Logger('AI Service');

export interface Enriched8kData {
    topic: string;
    summary: string;
    revenue?: number | null;
    eps?: number | null;
    reportingCurrency?: string | null;
    sentiment: 'Positive' | 'Negative' | 'Neutral';
    isEarnings: boolean;
}

export interface EnrichedFinancialData {
    revenue: number | null;
    eps: number | null;
    reportingCurrency?: string | null;
    summary: string;
}

export interface MetricWithDriver {
    amount: number | null;
    changeAmount: number | null;
    changePercent: number | null;
    driver: string | null;
    citationPage: number | null;
}

export interface MetricSimple {
    amount: number | null;
    changeAmount: number | null;
    changePercent: number | null;
    citationPage: number | null;
}

export interface DeepFinancialAnalysis {
    income: {
        revenue: MetricWithDriver;
        costOfRevenue: MetricSimple;
        totalExpenses: MetricWithDriver;
        netIncome: MetricWithDriver;
        eps: MetricSimple;
    };
    cashFlow: {
        freeCashFlow: MetricWithDriver;
    };
    balanceSheet: {
        totalAssets: MetricSimple;
        totalLiabilities: MetricSimple;
        equity: MetricSimple;
    };
    stockActivity: {
        repurchasedShares: number | null;
        issuedShares: number | null;
        netStockChangeShares: number | null;
        citationPage: number | null;
    };
    summary: {
        forwardLooking: string | null;
        reportingCurrency: string | null;
        citationPage: number | null;
    };
}

export interface AiService {
    enrich8k(text: string): Promise<Enriched8kData | null>;
    enrichFinancialReport(text: string, formType: string): Promise<EnrichedFinancialData | null>;
    enrichDeepFinancialReport(text: string, formType: string, ticker: string, filingDate: string): Promise<DeepFinancialAnalysis | null>;
}

export class VertexAiService implements AiService {

    async enrich8k(text: string): Promise<Enriched8kData | null> {
        return retry(async () => {
            try {
                const config = await getRemoteConfig();
                const modelName = config.gemini_model_name || 'gemini-3-flash-preview';
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
                   "revenue": "Extracted revenue number (e.g. 25200000000) OR null",
                   "eps": "Extracted EPS number (e.g. 0.72) OR null",
                   "reportingCurrency": "ISO 4217 Currency Code (e.g., USD, EUR, JPY) OR null",
                   "sentiment": "Positive" | "Negative" | "Neutral"
                }

                RULES:
                 1. **Format**: All money/share amounts must be raw **NUMBERS** (e.g., 10500000000, not "$10.5B"). 
                   - **CRITICAL**: Do NOT lose precision. If the report says "12.5 Billion", output 12500000000. If it says "12,543 million", output 12543000000.
                 2. If the text is just boilerplate or doesn't match the topics, set "topic": null.

                TEXT:
                ${text.substring(0, 1500000)} 
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
                    reportingCurrency: data.reportingCurrency || null,
                    sentiment: data.sentiment || 'Neutral',
                    isEarnings: !!data.isEarnings
                };

            } catch (error) {
                _logger.error("Error calling AI service", error);
                throw error;
            }
        }, { maxAttempts: 3, backoffFactor: 2 });
    }

    async enrichFinancialReport(text: string, formType: string): Promise<EnrichedFinancialData | null> {
        return retry(async () => {
            try {
                const config = await getRemoteConfig();
                const modelName = config.gemini_model_name || 'gemini-3-flash-preview';
                const model = getGeminiModel(modelName);

                const prompt = `
                You are a financial analyst. Analyze the following text from an SEC ${formType} filing.
                
                GOAL: Extract key financial metrics and provide a performance summary.

                if 10-Q is provided, focus STRICTLY on the columns labeled 'Three Months Ended [Current Period]'. Do NOT extract data from the 'Nine Months Ended' columns.

                EXTRACT:
                1. "revenue": The total revenue for the period (e.g. 25200000000). **MUST** be drawn from the Consolidated Statement of Operations / Income Statement.
                2. "eps": Diluted Earnings Per Share (e.g. 0.72). **MUST** be drawn from the Consolidated Statement of Operations / Income Statement.
                3. "summary": A 1-sentence summary explaining WHY the financial performance was up or down.  
                   - Focus on the "Results of Operations" or "Management's Discussion" section.
                   - **CRITICAL**: Do NOT return generic text like "10-Q filed". You must read the "Management's Discussion" and explain the drivers.
                   - e.g., "Revenue increased 16% due to record iPhone 15 sales." 
                   - e.g., "Net income fell due to higher R&D costs and legal settlements."
                   - Max 25 words. Simple language.

                Output JSON strictly.
                Format:
                {
                   "revenue": "Extracted revenue number (e.g. 25200000000) OR null",
                   "eps": "Extracted EPS number (e.g. 0.72) OR null",
                   "reportingCurrency": "ISO 4217 Currency Code (e.g., USD, EUR, JPY) OR null",
                   "summary": "string"
                }

                RULES:
                 1. **Format**: All money/share amounts must be raw **NUMBERS** (e.g., 10500000000, not "$10.5B"). 
                   - **CRITICAL**: Do NOT lose precision. If the report says "12.5 Billion", output 12500000000. If it says "12,543 million", output 12543000000.

                TEXT:
                ${text.substring(0, 1500000)}
                `;

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
                    reportingCurrency: data.reportingCurrency || null,
                    summary: data.summary || `${formType} analyzed.`
                };

            } catch (error) {
                _logger.error(`Error analyzing ${formType}`, error);
                throw error;
            }
        }, { maxAttempts: 3, backoffFactor: 2 });
    }

    async enrichDeepFinancialReport(text: string, formType: string, ticker: string, filingDate: string): Promise<DeepFinancialAnalysis | null> {
        return retry(async () => {
            try {
                const config = await getRemoteConfig();
                const modelName = config.gemini_model_name || 'gemini-3-flash-preview';
                const model = getGeminiModel(modelName);

                const prompt = `
                You are an expert financial analyst. Perform a deep "reasoning-based" analysis of this SEC ${formType} filing for ${ticker} (Filed: ${filingDate}).

                GOAL: Extract precise financial metrics, calculate derived values (Free Cash Flow, Net Stock Change), and explain the "Drivers" (Reasons) for changes based on the Management's Discussion and Notes.

                STRICT OUTPUT SCHEMA (JSON ONLY):
                {
                  "income": {
                    "revenue": { "amount": number, "changeAmount": number, "changePercent": number, "driver": "Reason for change", "citationPage": number },
                    "costOfRevenue": { "amount": number, "changeAmount": number, "changePercent": number, "citationPage": number },
                    "totalExpenses": { "amount": number, "changeAmount": number, "changePercent": number, "driver": "Reason for change", "citationPage": number },
                    "netIncome": { "amount": number, "changeAmount": number, "changePercent": number, "driver": "Reason for change", "citationPage": number },
                    "eps": { "amount": number, "changeAmount": number, "changePercent": number, "citationPage": number }
                  },
                  "cashFlow": {
                    "freeCashFlow": { 
                        "amount": number, 
                        "changeAmount": number, "changePercent": number, 
                        "driver": "Reason for change", 
                        "citationPage": number 
                    }
                  },
                  "balanceSheet": {
                    "totalAssets": { "amount": number, "changeAmount": number, "changePercent": number, "citationPage": number },
                    "totalLiabilities": { "amount": number, "changeAmount": number, "changePercent": number, "citationPage": number },
                    "equity": { "amount": number, "changeAmount": number, "changePercent": number, "citationPage": number }
                  },
                  "stockActivity": {
                    "repurchasedShares": number, 
                    "issuedShares": number, 
                    "netStockChangeShares": number, 
                    "citationPage": number
                  },
                  "summary": {
                    "forwardLooking": "Summary of forward-looking statements (Outlook/Guidance)",
                    "reportingCurrency": "ISO 4217 Currency Code (e.g., USD, EUR, JPY)",
                    "citationPage": number
                  }
                }

                RULES:
                1. **Nulls**: If a value cannot be found with certainty, return null. Do not guess.
                2. **Citations**: Provide the "citationPage" number for every section where data was found.
                3. **Drivers**: For Drivers, analyze the "Management's Discussion and Analysis" (MD&A) section. Provide a COMPLETE SENTENCE explaining the reason (e.g., "Revenue increased primarily due to higher sales of iPhone 15."). Do not just list keywords.
                4. **Calculations**: 
                   - **totalExpenses** = Revenue - Net Income
                   - **freeCashFlow** = Net Cash from Operating Activities - Capital Expenditures
                   - **netStockChangeShares** = Issued Shares - Repurchased Shares
                5. **Format**: All money/share amounts must be raw **NUMBERS** (e.g., 10500000000, not "$10.5B"). 
                   - **CRITICAL**: Do NOT lose precision. If the report says "12.5 Billion", output 12500000000. If it says "12,543 million", output 12543000000.
                 6. **Percentages**: All changes must be raw **NUMBERS** (e.g., 15.2, not "15.2%").
                 7. **Currency**: Explicitly identify the reporting currency and add it to the summary.reportingCurrency field.

                TEXT:
                ${text.substring(0, 1500000)}
                `;

                const result = await model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: 'application/json' }
                });

                const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!responseText) {
                    _logger.warn("AI returned empty response for deep analysis");
                    return null;
                }

                const parsed = JSON.parse(responseText);
                if (Array.isArray(parsed)) {
                    return parsed[0];
                }
                return parsed;

            } catch (error) {
                _logger.error(`Error performing deep analysis for ${ticker}`, error);
                throw error;
            }
        }, { maxAttempts: 3, backoffFactor: 2 });
    }
}
