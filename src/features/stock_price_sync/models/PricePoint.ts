export interface PricePoint {
    t: string;         // "HH:mm" ET of the bucket's newest bar — sessionDate supplies the date
    c: number;         // that bar's close
}
