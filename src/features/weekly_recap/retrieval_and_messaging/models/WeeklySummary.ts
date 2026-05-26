export interface WeeklySummary {
  ticker: string;
  companyName: string;
  weekEndDate: string;          // document ID, e.g. "2026-05-16"
  messageTitle: string;         // ≤ 50 chars — APNS notification title
  messageShortSummary: string;  // ≤ 150 chars — APNS notification body
}
