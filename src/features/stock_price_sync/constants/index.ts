export const FEATURE_NAME = 'stock_price_sync';

// Firestore collections
export const STOCK_PRICES_COLLECTION = 'stock_prices';

// Scheduling — cron fires every minute 9am–4:59pm ET weekdays; the use case's phase gate routes each minute
export const SCHEDULE = '* 9-16 * * 1-5';
export const TIMEZONE = 'America/New_York';

// Cloud Function deployment config. FUNCTION_TIMEOUT_SECONDS must stay above RUN_DURATION_WARN_MS
// (the warn threshold guards against runs creeping toward this hard timeout).
export const FUNCTION_MEMORY = '256MiB' as const;
export const FUNCTION_TIMEOUT_SECONDS = 60;
export const FUNCTION_MAX_INSTANCES = 1;

// Phase-boundary gates (ET minutes since midnight). Compile-time constants: the finalize step is
// guarded on the EOD record's date, not the clock, so the exact minute is not load-bearing.
export const PRE_OPEN_SEED_OPEN_MINUTE = 9 * 60 + 15;    // 9:15am → 555  (pre-open EOD previousClose seed)
export const MARKET_GATE_OPEN_MINUTE = 9 * 60 + 30;      // 9:30am → 570  (intraday start)
export const MARKET_GATE_CLOSE_MINUTE = 16 * 60 + 5;     // 4:05pm → 965  (intraday end)
export const CLOSE_FINALIZE_OPEN_MINUTE = 16 * 60 + 20;  // 4:20pm → 980  (post-close EOD finalize start)
export const CLOSE_FINALIZE_CLOSE_MINUTE = 16 * 60 + 59; // 4:59pm → 1019 (last cron fire of the day)

// Series label for the official market-close point appended to the finalized price series
export const MARKET_CLOSE_LABEL = '16:00';

// Run-duration warning threshold — beyond this the concurrency/timeout budget needs tuning
export const RUN_DURATION_WARN_MS = 45000;
