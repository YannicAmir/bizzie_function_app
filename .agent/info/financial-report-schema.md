# Financial Report Schema & Logic

This document defines the strict data structure and logic for the "Deep SEC Analysis" feature. This schema is the contract between the Cloud Function (`sec_filing_analyzer`) and the Frontend App.

## 1. Core Principles
*   **Source:** SEC Filings (10-K, 10-Q).
*   **Model:** Google Gemini 3.0 (Reasoning-Capable).
*   **Citations:** Every metric must have a `citationPage` number from the source document.
*   **Share Counts:** Stock repurchases and issuances must be in *shares*, not currency.
*   **Calculated Fields:**
    *   `Free Cash Flow` = `Net Cash from Operating Activities` - `Capital Expenditures`.
    *   `Net Stock Change` = `Repurchased Shares` - `Issued Shares`.

## 2. Database Structure
*   **Collection:** `financial_reports`
*   **Document ID:** `[TICKER]_[DATE]_[TYPE]` (Compound ID for fast idempotent lookup)
    *   Example: `AAPL_2024-10-31_10-K`

## 3. JSON Schema (TypeScript Interface)

```typescript
export interface FinancialReport {
  // --- Metadata ---
  id: string;                 // "AAPL_2024-10-31_10-K"
  ticker: string;             // "AAPL"
  filingDate: string;         // "2024-10-31" (Official filing date from SEC)
  dateAnalyzed: string;       // ISO Timestamp (When our system processed it)
  formType: "10-K" | "10-Q";

  // --- 1. Income Statement ---
  income: {
    revenue: {
      amount: string | null;          // e.g. "$94.9B"
      changeAmount: string | null;    // e.g. "+$5.3B"
      changePercent: string | null;   // e.g. "+6%"
      driver: string | null;          // "Increased due to high service demand..."
      citationPage: number | null;    // [REQUIRED]
    };
    costOfRevenue: {
      amount: string | null;
      changeAmount: string | null;
      changePercent: string | null;
      citationPage: number | null;    // [REQUIRED]
    };
    totalExpenses: {
      amount: string | null;
      changeAmount: string | null;
      changePercent: string | null;
      driver: string | null;          // "Higher R&D costs..."
      citationPage: number | null;    // [REQUIRED]
    };
    netIncome: {
      amount: string | null;
      changeAmount: string | null;
      changePercent: string | null;
      driver: string | null;          // "Dropped due to one-time tax charge."
      citationPage: number | null;    // [REQUIRED]
    };
    eps: { // Earnings Per Share (Diluted)
      amount: string | null;
      changeAmount: string | null;
      changePercent: string | null;
      citationPage: number | null;    // [REQUIRED]
    };
  };

  // --- 2. Cash Flow ---
  cashFlow: {
    freeCashFlow: {
      amount: string | null;       // Calculated: Operating Cash - CapEx
      changeAmount: string | null;
      changePercent: string | null;
      driver: string | null;       // "Dip caused by $1B investment in plant..."
      citationPage: number | null; // [REQUIRED] (Refers to Cash Flow Statement)
    };
  };

  // --- 3. Balance Sheet ---
  balanceSheet: {
    totalAssets: {
      amount: string | null;
      changeAmount: string | null;
      changePercent: string | null;
      citationPage: number | null; // [REQUIRED]
    };
    totalLiabilities: {
      amount: string | null;
      changeAmount: string | null;
      changePercent: string | null;
      citationPage: number | null; // [REQUIRED]
    };
    equity: { // Stockholder's/Shareholder's Equity
      amount: string | null;
      changeAmount: string | null;
      changePercent: string | null;
      citationPage: number | null; // [REQUIRED]
    };
  };

  // --- 4. Stock Activity (Share Counts) ---
  stockActivity: {
    repurchasedShares: string | null;     // e.g. "1.5M" (Count, not currency)
    issuedShares: string | null;          // e.g. "0.5M"
    netStockChangeShares: string | null;  // e.g. "-1.0M" (Calculated: Repurchased - Issued)
    citationPage: number | null;          // [REQUIRED]
  };

  // --- 5. Summary / Outlook ---
  summary: {
    forwardLooking: string | null;        // "Expects soft demand in China..."
    citationPage: number | null;          // [REQUIRED]
  };
}
```
