import { EodClose } from './models/EodClose';
import { YtdChangeSnapshot } from './models/YtdChangeSnapshot';

const PERCENT_MULTIPLIER = 100;

function yearStart(year: number): string {
    return `${year}-01-01`;
}

function pickClose(
    closes: EodClose[],
    prefers: (candidate: EodClose, current: EodClose) => boolean,
    accept: (record: EodClose) => boolean = () => true,
): EodClose | null {
    let best: EodClose | null = null;
    for (const record of closes) {
        if (accept(record) && (best === null || prefers(record, best))) {
            best = record;
        }
    }
    return best;
}

function latestClose(closes: EodClose[]): EodClose | null {
    return pickClose(closes, (candidate, current) => candidate.date > current.date);
}

function earliestClose(closes: EodClose[]): EodClose | null {
    return pickClose(closes, (candidate, current) => candidate.date < current.date);
}

function latestCloseBefore(closes: EodClose[], dateExclusive: string): EodClose | null {
    return pickClose(
        closes,
        (candidate, current) => candidate.date > current.date,
        (record) => record.date < dateExclusive,
    );
}

export interface YtdSnapshotInput {
    ticker: string;
    companyName: string;
    year: number;
    closes: EodClose[];
}

export function buildYtdSnapshot(input: YtdSnapshotInput): YtdChangeSnapshot | null {
    const { ticker, companyName, year, closes } = input;
    if (closes.length === 0) {
        return null;
    }

    const baseline = latestCloseBefore(closes, yearStart(year)) ?? earliestClose(closes);
    if (baseline === null || baseline.close === 0) {
        return null;
    }

    const latest = latestClose(closes);
    if (latest === null) {
        return null;
    }

    const ytdChange = latest.close - baseline.close;
    const ytdChangePercent = (ytdChange / baseline.close) * PERCENT_MULTIPLIER;

    return {
        ticker,
        companyName,
        year,
        baselineDate: baseline.date,
        baselineClose: baseline.close,
        latestDate: latest.date,
        latestClose: latest.close,
        ytdChange,
        ytdChangePercent,
    };
}
