import { Logger } from '../../../../core/logger';
import type { FmpService } from '../services/fmp_service';
import type { WeeklyRecapState } from '../usecase';

const logger = new Logger('WeeklyRecap/Storage/Node/FetchMarketData');

function logRejection(result: PromiseSettledResult<unknown>, label: string, ticker: string): void {
  if (result.status === 'rejected') {
    logger.warn(`${label} failed for ${ticker} — defaulting to []`, {
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  }
}

export function makeFetchMarketDataNode(fmp: FmpService) {
  return async (state: WeeklyRecapState): Promise<Partial<WeeklyRecapState>> => {
    const { ticker, startDate, endDate } = state;

    const [newsResult, prResult, filingsResult, pricesResult] = await Promise.allSettled([
      fmp.getNews(ticker, startDate, endDate),
      fmp.getPressReleases(ticker, startDate, endDate),
      fmp.get8Ks(ticker, startDate, endDate),
      fmp.getEodStockPrice(ticker, startDate, endDate),
    ]);

    logRejection(newsResult,    'getNews',          ticker);
    logRejection(prResult,      'getPressReleases',  ticker);
    logRejection(filingsResult, 'get8Ks',            ticker);
    logRejection(pricesResult,  'getEodStockPrice',  ticker);

    return {
      news:         newsResult.status    === 'fulfilled' ? newsResult.value    : [],
      pressReleases: prResult.status     === 'fulfilled' ? prResult.value      : [],
      filings:      filingsResult.status === 'fulfilled' ? filingsResult.value : [],
      prices:       pricesResult.status  === 'fulfilled' ? pricesResult.value  : [],
    };
  };
}
