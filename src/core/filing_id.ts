import * as crypto from 'crypto';
import { SecFiling } from './services/sec_service';

const HASH_ALGORITHM = 'sha256';
const DEDUPE_SEPARATOR = '::';

export function filingDedupeId(filing: SecFiling): string {
    if (!filing.finalLink) {
        throw new Error(`Cannot derive dedupe id: finalLink is empty for ${filing.symbol}`);
    }
    return crypto
        .createHash(HASH_ALGORITHM)
        .update(`${filing.symbol}${DEDUPE_SEPARATOR}${filing.finalLink}`)
        .digest('hex');
}
