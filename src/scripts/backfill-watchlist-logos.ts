import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load secrets manually for local execution
const secretPath = path.resolve(__dirname, '../../.secret.local');
if (fs.existsSync(secretPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(secretPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

// Resolve target project before firebase-admin initializes
const PROJECT_ALIASES: Record<string, string> = {
    dev: 'bizzie-dev-7199b',
    qa: 'bizzie-qa-e2f9c',
    prod: 'bizzie-prod',
};

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const projectArgIndex = args.indexOf('--project');
const projectArg = projectArgIndex !== -1 ? args[projectArgIndex + 1] : '';

if (!projectArg) {
    console.error('Usage: ts-node src/scripts/backfill-watchlist-logos.ts --project <dev|qa|prod|project-id> [--dry-run] [--force]');
    process.exit(1);
}
process.env.GCLOUD_PROJECT = PROJECT_ALIASES[projectArg] || projectArg;

import { getFirebaseAdmin } from '../core/firebase';
import { Logger } from '../core/logger';

const _logger = new Logger('Backfill Watchlist Logos');

interface FmpProfile {
    symbol: string;
    image?: string;
}

const logoCache = new Map<string, string | null>();

async function fetchLogoUrl(ticker: string, apiKey: string): Promise<string | null> {
    if (logoCache.has(ticker)) {
        return logoCache.get(ticker) ?? null;
    }

    // FMP uses dashes for share classes (BRK.B -> BRK-B)
    const fmpSymbol = ticker.replace(/\./g, '-');
    const url = `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(fmpSymbol)}&apikey=${apiKey}`;
    let logoUrl: string | null = null;
    try {
        const res = await fetch(url);
        if (!res.ok) {
            _logger.error(`FMP profile request failed for ${ticker}: HTTP ${res.status}`);
        } else {
            const data = (await res.json()) as FmpProfile[];
            logoUrl = Array.isArray(data) && data[0]?.image ? data[0].image : null;
            if (!logoUrl) {
                _logger.warn(`No image found in FMP profile for ${ticker}`);
            }
        }
    } catch (e) {
        _logger.error(`FMP profile fetch threw for ${ticker}`, e);
    }

    logoCache.set(ticker, logoUrl);
    return logoUrl;
}

async function run() {
    try {
        const fmpKey = process.env.FMP_API_KEY;
        if (!fmpKey) {
            throw new Error('FMP_API_KEY not found in process.env');
        }

        _logger.info(`Target project: ${process.env.GCLOUD_PROJECT}${DRY_RUN ? ' (DRY RUN — no writes)' : ''}`);

        const db = getFirebaseAdmin().firestore();

        // listDocuments() includes users that only exist as subcollection parents
        const userRefs = await db.collection('users').listDocuments();
        _logger.info(`Found ${userRefs.length} user documents.`);

        let updated = 0;
        let skipped = 0;
        let missingLogo = 0;

        for (const userRef of userRefs) {
            const watchlistSnap = await userRef.collection('watchlist').get();
            if (watchlistSnap.empty) {
                continue;
            }

            for (const doc of watchlistSnap.docs) {
                const ticker = (doc.data().ticker as string) || doc.id;

                if (doc.data().logoUrl && !FORCE) {
                    skipped++;
                    continue;
                }

                const logoUrl = await fetchLogoUrl(ticker, fmpKey);
                if (!logoUrl) {
                    missingLogo++;
                    continue;
                }

                if (DRY_RUN) {
                    _logger.info(`[dry-run] Would set logoUrl on ${doc.ref.path} -> ${logoUrl}`);
                } else {
                    await doc.ref.update({ logoUrl });
                    _logger.info(`Updated ${doc.ref.path}`);
                }
                updated++;
            }
        }

        _logger.info(`Done. ${DRY_RUN ? 'Would update' : 'Updated'}: ${updated}, skipped (already had logoUrl): ${skipped}, no logo found: ${missingLogo}, unique tickers fetched: ${logoCache.size}`);
        process.exit(0);
    } catch (error) {
        _logger.error('Backfill failed', error);
        process.exit(1);
    }
}

run();
