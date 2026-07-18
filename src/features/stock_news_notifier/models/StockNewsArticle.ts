export interface StockNewsArticle {
    symbol: string;
    publishedDate: string;
    publisher: string;
    title: string;
    image: string | null;
    site: string;
    text: string;
    url: string;
}
