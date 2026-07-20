import { IntradayBar } from '../models/IntradayBar';
import { FmpClient, FetchWindow, FmpEndpoint } from './fmp_client';

const FMP_HISTORICAL_CHART_1MIN_PATH = '/historical-chart/1min';

type FmpChartBarRaw = Readonly<{
    date?: unknown;
    open?: unknown;
    low?: unknown;
    high?: unknown;
    close?: unknown;
    volume?: unknown;
}>;

function parseFmpBar(item: unknown): IntradayBar | null {
    if (typeof item !== 'object' || item === null) {
        return null;
    }
    const raw = item as FmpChartBarRaw;
    if (typeof raw.date !== 'string' || !raw.date) return null;
    if (typeof raw.close !== 'number' || !Number.isFinite(raw.close)) return null;

    const close = raw.close;
    const open = typeof raw.open === 'number' && Number.isFinite(raw.open) ? raw.open : close;
    const low = typeof raw.low === 'number' && Number.isFinite(raw.low) ? raw.low : close;
    const high = typeof raw.high === 'number' && Number.isFinite(raw.high) ? raw.high : close;
    const volume = typeof raw.volume === 'number' && Number.isFinite(raw.volume) ? raw.volume : 0;

    return { date: raw.date, open, low, high, close, volume };
}

const FMP_CHART_ENDPOINT: FmpEndpoint<IntradayBar> = {
    path: FMP_HISTORICAL_CHART_1MIN_PATH,
    label: 'intraday',
    fetchFailedCode: 'FMP_FETCH_FAILED',
    invalidResponseCode: 'FMP_INVALID_RESPONSE',
    parseRow: parseFmpBar,
};

export class FmpChartService {
    private readonly client: FmpClient;

    constructor(apiKey: string) {
        this.client = new FmpClient(apiKey);
    }

    fetchIntradayBars(ticker: string, window: FetchWindow): Promise<IntradayBar[]> {
        return this.client.fetchWindowedRows(FMP_CHART_ENDPOINT, ticker, window);
    }
}
