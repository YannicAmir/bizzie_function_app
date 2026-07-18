import { MARKET_CLOSE_LABEL } from './constants';
import { IntradayBar } from './models/IntradayBar';
import { PricePoint } from './models/PricePoint';
import { PriceSnapshot } from './models/PriceSnapshot';

export interface SnapshotInput {
    ticker: string;
    companyName: string;
    bars: IntradayBar[];
    previousClose: number | null;
    today: string;
    bucketMinutes: number;
}

interface SnapshotBase {
    latestBarAt: string;
    latestClose: number;
    series: PricePoint[];
}

interface ResolvedSnapshot {
    price: number;
    series: PricePoint[];
    latestBarAt: string;
    closeFinalized: boolean;
}

function minutesSinceMidnightFromDate(date: string): number {
    const hh = Number(date.slice(11, 13));
    const mm = Number(date.slice(14, 16));
    return hh * 60 + mm;
}

function downsampleSeries(sortedBars: IntradayBar[], bucketMinutes: number): PricePoint[] {
    const size = bucketMinutes > 0 ? bucketMinutes : 1;
    const byBucket = new Map<number, IntradayBar>();
    for (const bar of sortedBars) {
        const bucket = Math.floor(minutesSinceMidnightFromDate(bar.date) / size);
        byBucket.set(bucket, bar); 
    }
    return [...byBucket.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, bar]) => ({ t: bar.date.slice(11, 16), c: bar.close }));
}

export function buildIntradaySnapshot(input: SnapshotInput): PriceSnapshot | null {
    const base = prepareSnapshotBase(input);
    if (base === null) {
        return null;
    }
    return assembleSnapshot(input, {
        price: base.latestClose,
        series: base.series,
        latestBarAt: base.latestBarAt,
        closeFinalized: false,
    });
}

export function buildFinalizedSnapshot(input: SnapshotInput, officialClose: number): PriceSnapshot | null {
    const base = prepareSnapshotBase(input);
    if (base === null) {
        return null;
    }
    return assembleSnapshot(input, {
        price: officialClose,
        series: [...base.series, { t: MARKET_CLOSE_LABEL, c: officialClose }],
        latestBarAt: base.latestBarAt,
        closeFinalized: true,
    });
}

function prepareSnapshotBase(input: SnapshotInput): SnapshotBase | null {
    const todayBars = input.bars.filter((b) => b.date.slice(0, 10) === input.today);
    if (todayBars.length === 0) {
        return null;
    }
    todayBars.sort((a, b) => a.date.localeCompare(b.date));

    const latest = todayBars[todayBars.length - 1]!;
    return {
        latestBarAt: latest.date,
        latestClose: latest.close,
        series: downsampleSeries(todayBars, input.bucketMinutes),
    };
}

function assembleSnapshot(input: SnapshotInput, resolved: ResolvedSnapshot): PriceSnapshot {
    const { previousClose } = input;
    const usablePrevClose = previousClose !== null && previousClose !== 0 ? previousClose : null;
    const change = usablePrevClose !== null ? resolved.price - usablePrevClose : null;
    const changePercent = usablePrevClose !== null ? (change! / usablePrevClose) * 100 : null;

    return {
        ticker: input.ticker,
        companyName: input.companyName,
        price: resolved.price,
        previousClose,
        change,
        changePercent,
        sessionDate: input.today,
        series: resolved.series,
        latestBarAt: resolved.latestBarAt,
        closeFinalized: resolved.closeFinalized,
    };
}
