import { getFirebaseAdmin } from './firebase';
import { Logger } from './logger';

const _logger = new Logger("Remote Config");

// Interface for our Application Configuration
export interface AppConfig {
  sectors: string[];
  modelName: string;
  gemini_model_name: string | undefined; // Specific for Deep Analysis (Gemini 3.0)
  subscriptionDripCampaign: string;
  fmp: {
    baseUrl: string;
    v3Url: string;
    v4Url: string;
  };
}

// Default Fallback Configuration (Safety Net)
const DEFAULT_CONFIG: AppConfig = {
  // Standard GICS Sectors
  sectors: [
    "Energy",
    "Materials",
    "Industrials",
    "Consumer Discretionary",
    "Consumer Staples",
    "Health Care",
    "Financials",
    "Information Technology",
    "Communication Services",
    "Utilities",
    "Real Estate"
  ],
  // Current Stable Model
  modelName: "gemini-3-flash-preview",
  gemini_model_name: undefined,
  // Default Drip Campaign (Days 1-7)
  subscriptionDripCampaign: JSON.stringify({
    1: { title: 'Welcome to Bizzie! 🚀', body: 'Unlock the power of AI with Bizzie Plus' },
    2: { title: 'We Have A Gift for You 🎁', body: 'Open now to see the surprise' },
    3: { title: 'Your Discount is Waiting 🏷️', body: 'Get Bizzie Plus for 40% off now!' },
    4: { title: 'Get 40% Discount on Bizzie Plus ⚡️', body: "Subscribe to unlock Bizzie's Daily Picks" },
    5: { title: 'Bizzie Plus for 40% Discount 💎', body: "Subscribe to Bizzie Plus to unlock all Bizzie's features like product and brand search" },
    6: { title: "Unlock Bizzie's Full Potential 🔓", body: "Subscribe to Bizzie Plus to get AI analyses of financial reports. Get the information that matters in seconds!" },
    7: { title: 'Last Call! 40% Off Bizzie Plus ⏳', body: 'Save time sifting through reports with AI analysis. Subscribe to Bizzie Plus to enjoy now!' }
  }),
  // FMP Configuration
  fmp: {
    baseUrl: "https://financialmodelingprep.com/stable",
    v3Url: "https://financialmodelingprep.com/api/v3",
    v4Url: "https://financialmodelingprep.com/api/v4"
  }
};

// Caching Mechanism
let configCache: AppConfig | null = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 Hour

export const getRemoteConfig = async (): Promise<AppConfig> => {
  const now = Date.now();

  // 1. Check Cache
  if (configCache && (now - lastFetchTime < CACHE_DURATION_MS)) {
    _logger.debug("Using cached config");
    return configCache;
  }

  try {
    _logger.info("Fetching from Firebase...");
    const template = await getFirebaseAdmin().remoteConfig().getTemplate();

    // 2. Parse Parameters
    const rawSectors = (template.parameters['daily_brands_sectors']?.defaultValue as { value?: string } | undefined)?.value;
    const rawModelName = (template.parameters['gemini_model_name']?.defaultValue as { value?: string } | undefined)?.value;
    const rawDrip = (template.parameters['subscription_drip_campaign']?.defaultValue as { value?: string } | undefined)?.value;
    const rawFmp = (template.parameters['fmp_config']?.defaultValue as { value?: string } | undefined)?.value;

    // 3. Construct Config with Fallbacks per field
    const sectors = rawSectors ? JSON.parse(rawSectors) : DEFAULT_CONFIG.sectors;
    const modelName = (rawModelName as string) || DEFAULT_CONFIG.modelName;
    const subscriptionDripCampaign = (rawDrip as string) || DEFAULT_CONFIG.subscriptionDripCampaign;
    const fmp = rawFmp ? JSON.parse(rawFmp) : DEFAULT_CONFIG.fmp;

    const newConfig: AppConfig = {
      sectors,
      modelName,
      gemini_model_name: (template.parameters['gemini_model_name']?.defaultValue as { value?: string } | undefined)?.value,
      subscriptionDripCampaign,
      fmp
    };

    // 4. Update Cache
    configCache = newConfig;
    lastFetchTime = now;
    _logger.info("Refreshed successfully", newConfig);

    return newConfig;

  } catch (error) {
    _logger.error("Failed to fetch. Using Defaults.", error);
    // Fallback to defaults on error to keep app alive
    return DEFAULT_CONFIG;
  }
};
