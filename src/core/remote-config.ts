import { getFirebaseAdmin } from './firebase';
import { Logger } from './logger';

const _logger = new Logger("Remote Config");

export interface AppConfig {
  sectors: string[];
  gemini_model_name: string;
  subscriptionDripCampaign: string;
  fmp: {
    baseUrl: string;
    v3Url: string;
    v4Url: string;
  };
  bizzie_chat: {
    chat_model: string;
    chat_model_flash: string;
    chat_model_lite: string;
    llm_responses_per_day: number;
  };
  weekly_recap: {
    model: string;
  };
}

const DEFAULT_CONFIG: AppConfig = {
  sectors: [
    "Energy",
    "Materials",
    "Industrials",
    "Consumer Discretionary",
    "Consumer Staples",
    "Healthcare",
    "Financials",
    "Information Technology",
    "Communication Services",
    "Utilities",
    "Real Estate"
  ],
  gemini_model_name: "gemini-3-flash-preview",
  subscriptionDripCampaign: JSON.stringify({
    1: { title: 'Welcome to Bizzie! 🚀', body: 'Unlock the power of AI with Bizzie Plus' },
    2: { title: 'We Have A Gift for You 🎁', body: 'Open now to see the surprise' },
    3: { title: 'Your Discount is Waiting 🏷️', body: 'Get Bizzie Plus for 40% off now!' },
    4: { title: 'Get 40% Discount on Bizzie Plus ⚡️', body: "Subscribe to unlock Bizzie's Daily Picks" },
    5: { title: 'Bizzie Plus for 40% Discount 💎', body: "Subscribe to Bizzie Plus to unlock all Bizzie's features like product and brand search" },
    6: { title: "Unlock Bizzie's Full Potential 🔓", body: "Subscribe to Bizzie Plus to get AI analyses of financial reports. Get the information that matters in seconds!" },
    7: { title: 'Last Call! 40% Off Bizzie Plus ⏳', body: 'Save time sifting through reports with AI analysis. Subscribe to Bizzie Plus to enjoy now!' }
  }),
  fmp: {
    baseUrl: "https://financialmodelingprep.com/stable",
    v3Url: "https://financialmodelingprep.com/api/v3",
    v4Url: "https://financialmodelingprep.com/api/v4"
  },
  bizzie_chat: {
    chat_model: "gemini-3.1-pro-preview",
    chat_model_flash: "gemini-3-flash-preview",
    chat_model_lite: "gemini-3.1-flash-lite-preview",
    llm_responses_per_day: 20,
  },
  weekly_recap: {
    model: "gemini-3-flash-preview",
  },
};

let configCache: AppConfig | null = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 60 * 60 * 1000;

export const getRemoteConfig = async (): Promise<AppConfig> => {
  const now = Date.now();

  if (configCache && (now - lastFetchTime < CACHE_DURATION_MS)) {
    _logger.debug("Using cached config");
    return configCache;
  }

  try {
    _logger.info("Fetching from Firebase...");
    const template = await getFirebaseAdmin().remoteConfig().getTemplate();

    const rawSectors = (template.parameters['daily_brands_sectors']?.defaultValue as { value?: string } | undefined)?.value;
    const rawModelName = (template.parameters['gemini_model_name']?.defaultValue as { value?: string } | undefined)?.value;
    const rawDrip = (template.parameters['subscription_drip_campaign']?.defaultValue as { value?: string } | undefined)?.value;
    const rawFmp = (template.parameters['fmp_config']?.defaultValue as { value?: string } | undefined)?.value;
    const rawChatModel = (template.parameters['chat_model']?.defaultValue as { value?: string } | undefined)?.value;
    const rawChatModelFlash = (template.parameters['chat_model_flash']?.defaultValue as { value?: string } | undefined)?.value;
    const rawChatModelLite = (template.parameters['chat_model_lite']?.defaultValue as { value?: string } | undefined)?.value;
    const rawLlmResponsesPerDay = (template.parameters['llm_responses_per_day']?.defaultValue as { value?: string } | undefined)?.value;
    const rawWeeklyRecapModel = (template.parameters['weekly_recap_model']?.defaultValue as { value?: string } | undefined)?.value;

    const sectors = rawSectors ? JSON.parse(rawSectors) : DEFAULT_CONFIG.sectors;
    const gemini_model_name = (rawModelName as string) || DEFAULT_CONFIG.gemini_model_name;
    const subscriptionDripCampaign = (rawDrip as string) || DEFAULT_CONFIG.subscriptionDripCampaign;
    const fmp = rawFmp ? JSON.parse(rawFmp) : DEFAULT_CONFIG.fmp;

    const newConfig: AppConfig = {
      sectors,
      gemini_model_name,
      subscriptionDripCampaign,
      fmp,
      bizzie_chat: {
        chat_model: rawChatModel || DEFAULT_CONFIG.bizzie_chat.chat_model,
        chat_model_flash: rawChatModelFlash || DEFAULT_CONFIG.bizzie_chat.chat_model_flash,
        chat_model_lite: rawChatModelLite || DEFAULT_CONFIG.bizzie_chat.chat_model_lite,
        llm_responses_per_day: rawLlmResponsesPerDay
          ? parseInt(rawLlmResponsesPerDay, 10)
          : DEFAULT_CONFIG.bizzie_chat.llm_responses_per_day,
      },
      weekly_recap: {
        model: rawWeeklyRecapModel || DEFAULT_CONFIG.weekly_recap.model,
      },
    };

    configCache = newConfig;
    lastFetchTime = now;
    _logger.info("Refreshed successfully", newConfig);

    return newConfig;

  } catch (error) {
    _logger.error("Failed to fetch. Using Defaults.", error);
    return DEFAULT_CONFIG;
  }
};
