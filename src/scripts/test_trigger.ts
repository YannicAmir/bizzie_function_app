
import { initializeApp, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize with default credentials (requires GOOGLE_APPLICATION_CREDENTIALS or gcloud auth application-default login)
initializeApp();

const db = getFirestore();

async function main() {
    console.log('Project ID:', getApp().options.projectId || process.env.GCLOUD_PROJECT || 'unknown');

    const userId = 'manual-test-user';
    const ticker = 'TEST_TICKER';
    const companyName = 'Test Company Inc';

    console.log(`Writing to users/${userId}/watchlist/${ticker}...`);

    await db.collection('users').doc(userId).collection('watchlist').doc(ticker).set({
        ticker,
        companyName,
        createdAt: new Date()
    });

    console.log('Write complete. Please check the Cloud Function logs in ~30 seconds.');
}

main().catch(console.error);
