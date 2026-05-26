export interface FcmPayload {
  notification: {
    title: string;  // messageTitle from WeeklySummary
    body: string;   // messageShortSummary from WeeklySummary
  };
  data: {
    type: 'weekly_summary';
    ticker: string;
  };
  topic: string;  // ticker symbol — used for APNS topic routing
}
