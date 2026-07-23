export interface YtdChangeSnapshot {
    ticker: string;
    companyName: string;
    year: number;
    baselineDate: string;
    baselineClose: number;
    latestDate: string;
    latestClose: number;
    ytdChange: number;
    ytdChangePercent: number;
}
