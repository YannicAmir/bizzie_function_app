import { DailyClose } from '../models/DailyClose';
import { FmpClient, FetchWindow, FmpEndpoint } from './fmp_client';

const FMP_EOD_LIGHT_PATH = '/historical-price-eod/light';

type FmpEodRaw = Readonly<{
    symbol?: unknown;
    date?: unknown;
    price?: unknown;
    volume?: unknown;
}>;

function parseEodClose(item: unknown): DailyClose | null {
    if (typeof item !== 'object' || item === null) {
        return null;
    }
    const raw = item as FmpEodRaw;
    if (typeof raw.date !== 'string' || !raw.date) return null;
    if (typeof raw.price !== 'number' || !Number.isFinite(raw.price)) return null;

    return { date: raw.date, close: raw.price };
}

const FMP_EOD_ENDPOINT: FmpEndpoint<DailyClose> = {
    path: FMP_EOD_LIGHT_PATH,
    label: 'EOD',
    fetchFailedCode: 'FMP_EOD_FETCH_FAILED',
    invalidResponseCode: 'FMP_EOD_INVALID_RESPONSE',
    parseRow: parseEodClose,
};

export class FmpEodService {
    private readonly client: FmpClient;

    constructor(apiKey: string) {
        this.client = new FmpClient(apiKey);
    }

    fetchDailyCloses(ticker: string, window: FetchWindow): Promise<DailyClose[]> {
        return this.client.fetchWindowedRows(FMP_EOD_ENDPOINT, ticker, window);
    }
}
