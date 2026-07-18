export const FEATURE_NAME = 'stock_news_notifier';

// Firestore collections / documents
export const STOCK_NEWS_COLLECTION = 'stock_news';
export const STATE_COLLECTION = 'stock_news_notifier_state';
export const STATE_DOC_ID = 'ingestion';
export const COOLDOWNS_COLLECTION = 'stock_news_cooldowns';

// Scheduling
export const SCHEDULE = '* 4-23 * * *'; // every minute, 4:00am–11:59pm EST
export const TIMEZONE = 'America/New_York';

// Time unit conversions
export const MS_PER_SECOND = 1000;
export const MS_PER_HOUR = 60 * 60 * MS_PER_SECOND;

// Defaults / limits
export const LEASE_DURATION_SECONDS = 90; // function timeout is 60s; crashed run self-expires
export const NEWS_TTL_HOURS = 72;         // stock_news expireAt = createdAt + 72h
export const NOTIFICATION_BODY_MAX_CHARS = 178;
export const MULTI_ARTICLE_BODY_SUFFIX = '... and more';
