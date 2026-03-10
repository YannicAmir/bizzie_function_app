import { config } from '../../../core/config';
import { getRemoteConfig } from '../../../core/remote-config';
import { Logger } from '../../../core/logger';
import { retry } from '../../../core/retry';

import { z } from 'zod';

const logger = new Logger('FmpService');

const FmpStockSchema = z.object({
    symbol: z.string(),
    companyName: z.string().nullable(),
});

type FmpStockDTO = z.infer<typeof FmpStockSchema>;

export class FmpService {
    async fetchAllStocks(): Promise<FmpStockDTO[]> {
        const remoteConfig = await getRemoteConfig();
        const baseUrl = remoteConfig.fmp.baseUrl;
        const url = `${baseUrl}/stock-list?apikey=${config.fmpApiKey}`;

        return await retry(async () => {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch stock list: ${response.statusText}`);
            }
            const data = await response.json();

            const parsedData = z.array(FmpStockSchema).parse(data);

            logger.info(`Fetched ${parsedData.length} stocks from FMP`);
            return parsedData;
        });
    }
}
