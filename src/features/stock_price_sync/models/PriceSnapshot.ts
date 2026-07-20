import { PricePoint } from './PricePoint';

export interface PriceSnapshot {
    ticker: string;
    companyName: string;
    price: number;                  // close of the newest 1-min bar of the current session
    previousClose: number | null;   // final bar close of the prior trading session (daily seed fetch)
    change: number | null;
    changePercent: number | null;
    sessionDate: string;
    series: PricePoint[];           // current session, downsampled to seriesBucketMinutes buckets (+ 16:00 close point on finalize)
    latestBarAt: string;
    closeFinalized: boolean;        // true once the official EOD close has replaced the last-trade price
}
