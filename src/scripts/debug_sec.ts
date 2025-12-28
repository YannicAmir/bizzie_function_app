
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load secrets
const secretPath = path.resolve(__dirname, '../../.secret.local');
if (fs.existsSync(secretPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(secretPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const fmpKey = process.env.FMP_API_KEY;

async function check() {
    // Check 10-K for a broad range to ensure we get data
    const url = `https://financialmodelingprep.com/stable/sec-filings-search/form-type?formType=10-K&page=0&limit=5&apikey=${fmpKey}`;
    console.log("Fetching:", url);

    try {
        const res = await fetch(url);
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}

check();
