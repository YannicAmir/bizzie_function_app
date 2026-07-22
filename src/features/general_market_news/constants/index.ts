export const FEATURE_NAME = 'general_market_news';

// Firestore collections / documents
export const GENERAL_MARKET_NEWS_COLLECTION = 'general_market_news';
export const STATE_COLLECTION = 'general_market_news_state';
export const STATE_DOC_ID = 'ingestion';

// Scheduling
export const SCHEDULE = '* * * * *'; // every minute, all day (finest poll tick; cadence gated by runIntervalSeconds)
export const TIMEZONE = 'America/New_York';

// Cloud Function runtime config
export const MEMORY = '256MiB';
export const MAX_INSTANCES = 1; // single writer; reinforces the Firestore lease
export const FUNCTION_TIMEOUT_SECONDS = 60;

// Time unit conversions
export const MS_PER_SECOND = 1000;
export const MS_PER_HOUR = 60 * 60 * MS_PER_SECOND;

// Defaults / limits
export const LEASE_DURATION_SECONDS = FUNCTION_TIMEOUT_SECONDS + 30; // must outlive the timeout so a crashed run self-expires
export const NEWS_TTL_HOURS = 48;         // general_market_news expireAt = createdAt + 48h

// First-run overrides — fetch only page 0 and skip ranged backfill while bootstrapping the cursor
export const FIRST_RUN_MAX_PAGES = 1;
export const FIRST_RUN_MAX_BACKFILL_PAGES = 0;
