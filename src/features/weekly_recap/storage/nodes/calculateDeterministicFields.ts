import type { WeeklyRecapState } from '../usecase';
import type { CountFields, PriceMovement } from '../models';

export function makeCalculateDeterministicFieldsNode() {
  return async (state: WeeklyRecapState): Promise<Partial<WeeklyRecapState>> => {
    const { news, filings, prices } = state;

    const counts: CountFields = {
      newArticleCount: news.length,
      eightKCount: filings.length,
      eodStockPriceCount: prices.length,
    };

    let priceMovement: PriceMovement;

    if (prices.length === 0) {
      priceMovement = {
        startPrice: null,
        endPrice: null,
        priceChange: null,
        priceChangePercent: null,
      };
    } else {
      const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));
      const startPrice = sorted[0]!.price;
      const endPrice = sorted[sorted.length - 1]!.price;
      const priceChange = Math.round((endPrice - startPrice) * 100) / 100;
      const priceChangePercent =
        startPrice !== 0
          ? Math.round(((endPrice - startPrice) / startPrice) * 10000) / 100
          : null;

      priceMovement = {
        startPrice,
        endPrice,
        priceChange,
        priceChangePercent,
      };
    }

    return { counts, priceMovement };
  };
}
