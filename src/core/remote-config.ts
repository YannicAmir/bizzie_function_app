import * as admin from 'firebase-admin';
import { Logger } from './logger';

const _logger = new Logger("Remote Config");

// Interface for our Application Configuration
export interface AppConfig {
  sectors: string[];
  modelName: string;
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
  modelName: "gemini-3-flash-preview"
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
    const template = await admin.remoteConfig().getTemplate();

    // 2. Parse Parameters
    const rawSectors = (template.parameters['daily_brands_sectors']?.defaultValue as any)?.value;
    const rawModelName = (template.parameters['gemini_model_name']?.defaultValue as any)?.value;

    // 3. Construct Config with Fallbacks per field
    const sectors = rawSectors ? JSON.parse(rawSectors) : DEFAULT_CONFIG.sectors;
    const modelName = (rawModelName as string) || DEFAULT_CONFIG.modelName;

    const newConfig: AppConfig = {
      sectors,
      modelName
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
