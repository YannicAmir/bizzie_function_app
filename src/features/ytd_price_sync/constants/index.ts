export const FEATURE_NAME = 'ytd_price_sync';

// Firestore collections
export const YTD_PRICE_CHANGE_COLLECTION = 'ytd_price_change';

// Scheduling — fires every 10 minutes, every day. 
export const SCHEDULE = '*/10 * * * *';
export const TIMEZONE = 'America/New_York';

// Cloud Function deployment config. The 300s timeout (vs stock_price_sync's 60s) reflects
// that each fire processes the whole watchlist rather than a per-minute cohort;
// maxInstances: 1 keeps last-write-wins correct.
export const FUNCTION_MEMORY = '256MiB' as const;
export const FUNCTION_TIMEOUT_SECONDS = 300;
export const FUNCTION_MAX_INSTANCES = 1;

// Run-duration warning threshold — beyond this the concurrency/timeout budget needs tuning
// (kept well under FUNCTION_TIMEOUT_SECONDS to catch runs creeping toward the hard timeout).
export const RUN_DURATION_WARN_MS = 240000;
