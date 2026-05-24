import { config } from '../../../../core/config';
import { getRemoteConfig } from '../../../../core/remote-config';
import { Logger } from '../../../../core/logger';
import { retry } from '../../../../core/retry';
import { AppError } from '../../../../core/errors';
import type { NewsArticle, Filing8K, StockPrice } from '../models';

const logger = new Logger('WeeklyRecap/Storage/FmpService');

type FmpArticleRaw = Readonly<{
  title?: unknown;
  text?: unknown;
  publishedDate?: unknown;
  url?: unknown;
}>;

type FmpFilingRaw = Readonly<{
  formType?: unknown;
  title?: unknown;
  filingDate?: unknown;
  link?: unknown;
  finalLink?: unknown;
}>;

type FmpPriceRaw = Readonly<{
  date?: unknown;
  price?: unknown;
  volume?: unknown;
}>;

function isTransientError(err: unknown): boolean {
  if (err instanceof AppError) {
    return err.status === 429 || err.status === 500 || err.status === 503;
  }
  const message = err instanceof Error ? err.message : '';
  return (
    message.includes('UNAVAILABLE') ||
    message.includes('DEADLINE_EXCEEDED') ||
    message.includes('INTERNAL') ||
    message.includes('timeout') ||
    message.includes('network')
  );
}

const FMP_PAGE = 0;
const FMP_NEWS_LIMIT = 30;
const FMP_FILINGS_LIMIT = 20;

function mapArticle(item: unknown): { title: string; text: string; publishedDate: string; url: string } {
  const raw = item as FmpArticleRaw;
  return {
    title: String(raw.title ?? ''),
    text: String(raw.text ?? ''),
    publishedDate: String(raw.publishedDate ?? ''),
    url: String(raw.url ?? ''),
  };
}

const FMP_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffFactor: 2,
  maxDelayMs: 30000,
  shouldRetry: isTransientError,
};

export class FmpService {
  private async getBaseUrl(): Promise<string> {
    return (await getRemoteConfig()).fmp.baseUrl;
  }

  private async fetchJson(url: string, resourceType: string, ticker: string): Promise<unknown[]> {
    try {
      const results = await retry(async () => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new AppError(
            `FMP ${resourceType} fetch failed: ${response.statusText}`,
            'FMP_FETCH_FAILED',
            response.status,
          );
        }
        return response.json() as Promise<unknown[]>;
      }, {
        ...FMP_RETRY_OPTIONS,
        onRetry: (attempt: number, err: unknown) =>
          logger.warn(`Retrying ${resourceType} fetch for ${ticker} — attempt ${attempt}`, { error: err }),
      });
      return Array.isArray(results) ? results : [];
    } catch (err) {
      logger.error(`All retries exhausted for ${resourceType} fetch — ${ticker}`, { error: err });
      throw err;
    }
  }

  async getNews(ticker: string, startDate: string, endDate: string): Promise<NewsArticle[]> {
    const baseUrl = await this.getBaseUrl();
    const url = `${baseUrl}/news/stock?symbols=${ticker}&from=${startDate}&to=${endDate}&page=${FMP_PAGE}&limit=${FMP_NEWS_LIMIT}&apikey=${config.fmpApiKey}`;

    logger.info(`Fetching news for ${ticker}`, { ticker, startDate, endDate });

    const articles = await this.fetchJson(url, 'news', ticker);

    if (articles.length === 0) {
      logger.warn(`No news found for ${ticker} in ${startDate}–${endDate}`);
    } else {
      logger.info(`Fetched ${articles.length} news for ${ticker}`);
    }

    return articles.map(mapArticle);
  }

  async get8Ks(ticker: string, startDate: string, endDate: string): Promise<Filing8K[]> {
    const baseUrl = await this.getBaseUrl();
    const url = `${baseUrl}/sec-filings-search/symbol?symbol=${ticker}&from=${startDate}&to=${endDate}&page=${FMP_PAGE}&limit=${FMP_FILINGS_LIMIT}&apikey=${config.fmpApiKey}`;

    logger.info(`Fetching 8Ks for ${ticker}`, { ticker, startDate, endDate });

    const allFilings = await this.fetchJson(url, '8Ks', ticker);
    const eightKFilings = allFilings.filter((item) => {
      const raw = item as FmpFilingRaw;
      return raw.formType === '8-K';
    });

    if (eightKFilings.length === 0) {
      logger.warn(`No 8Ks found for ${ticker} in ${startDate}–${endDate}`);
    } else {
      logger.info(`Fetched ${eightKFilings.length} 8Ks for ${ticker}`);
    }

    return eightKFilings.map((item) => {
      const raw = item as FmpFilingRaw;
      return {
        title: String(raw.title ?? ''),
        formType: '8-K',
        filingDate: String(raw.filingDate ?? ''),
        link: String(raw.link ?? ''),
        finalLink: String(raw.finalLink ?? ''),
      };
    });
  }

  async getEodStockPrice(ticker: string, startDate: string, endDate: string): Promise<StockPrice[]> {
    const baseUrl = await this.getBaseUrl();
    const url = `${baseUrl}/historical-price-eod/light?symbol=${ticker}&from=${startDate}&to=${endDate}&apikey=${config.fmpApiKey}`;

    logger.info(`Fetching eodPrices for ${ticker}`, { ticker, startDate, endDate });

    const prices = await this.fetchJson(url, 'eodPrices', ticker);

    if (prices.length === 0) {
      logger.warn(`No eodPrices found for ${ticker} in ${startDate}–${endDate}`);
    } else {
      logger.info(`Fetched ${prices.length} eodPrices for ${ticker}`);
    }

    return prices.map((item) => {
      const raw = item as FmpPriceRaw;
      return {
        date: String(raw.date ?? ''),
        price: Number(raw.price ?? 0),
        volume: Number(raw.volume ?? 0),
      };
    });
  }
}
