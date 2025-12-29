
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import * as readline from 'readline';
import { RemoteConfigService } from '../features/subscription_drip/services/config_service';

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();
const messaging = getMessaging();
const configService = new RemoteConfigService();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question: string): Promise<string> {
    return new Promise(resolve => rl.question(question, resolve));
}

// Replicate UseCase logic locally (simpler than instantiating the full cloud function stack)
async function runDripForUser(userId: string, fcmToken: string, day: number) {
    console.log(`\n--- Running Drip User Logic for Day ${day} ---`);
    console.log(`Target: User ${userId}`);

    // Fetch real config
    const dripConfig = await configService.getDripCampaign();

    const message = dripConfig[day];
    if (!message) {
        console.log(`No message configured for Day ${day}. Skipping.`);
        return;
    }

    console.log(`Sending Payload:`);
    console.log(`Title: ${message.title}`);
    console.log(`Body: ${message.body}`);

    try {
        await messaging.send({
            token: fcmToken,
            notification: {
                title: message.title,
                body: message.body
            },
            data: {
                type: 'subscription_drip',
                daysSinceSignup: day.toString(),
                click_action: 'FLUTTER_NOTIFICATION_CLICK'
            }
        });
        console.log(`✅ Notification SENT to device! Check your phone.`);
    } catch (e: any) {
        console.error(`❌ Failed to send: ${e.message}`);
    }
}

async function main() {
    console.log("=== Manual Drip Tester (On Device) ===");
    console.log("This script simulates the Drip Campaign for a specific user ID.");
    console.log("Using Remote Config for messages.");

    const userId = await ask("Enter target User ID (from Firestore): ");

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        console.error("User not found!");
        process.exit(1);
    }

    const userData = userDoc.data();
    if (!userData?.fcmToken) {
        console.error("User has no FCM Token! Log in on the device first.");
        process.exit(1);
    }

    const originalCreatedAt = userData.createdAt; // Backup
    console.log(`\nFound User! Original CreatedAt: ${originalCreatedAt}`);
    console.log(`FCM Token: ${userData.fcmToken.substring(0, 10)}...`);

    try {
        for (let day = 1; day <= 7; day++) {
            const answer = await ask(`\nReady to test Day ${day}? (y/n/skip): `);
            if (answer.toLowerCase() === 'n') break;
            if (answer.toLowerCase() === 'skip') continue;

            const mockDate = new Date();
            mockDate.setDate(mockDate.getDate() - day);

            // 2. Run Logic
            await runDripForUser(userId, userData.fcmToken, day);
        }
    } finally {
        console.log("\nRestoring original user state...");
        // if (originalCreatedAt) await userRef.update({ createdAt: originalCreatedAt });
        console.log("Done.");
        process.exit(0);
    }
}

main();
