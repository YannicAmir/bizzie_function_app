import * as admin from 'firebase-admin';

// Point to the Auth Emulator
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

// Initialize with a dummy project ID for local use
if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'bizzie-dev-7199b' });
}

async function generateTestToken() {
    const uid = 'test-user-bizzie-001';
    const email = 'test@bizzie.com';

    try {
        // 1. Create or fetch the user in the Auth Emulator
        try {
            await admin.auth().createUser({
                uid,
                email,
                password: 'password123',
            });
            console.log(`Created new test user: ${email}`);
        } catch (e) {
            if ((e as { code?: string }).code === 'auth/uid-already-exists') {
                console.log(`Test user ${email} already exists.`);
            } else {
                throw e;
            }
        }

        // 2. Since we can't easily "sign in" via Admin SDK to get an ID Token (only Custom Tokens),
        // we use a trick: the Admin SDK can't generate ID Tokens directly.
        // For Postman testing, we either use a Custom Token OR we need a real ID Token.
        // Actually, the easiest way to get a real ID Token for the emulator is a simple fetch call 
        // to the Identity Platform emulator endpoint.

        const response = await fetch(`http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`, {
            method: 'POST',
            body: JSON.stringify({
                email,
                password: 'password123',
                returnSecureToken: true
            }),
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json() as { idToken?: string };

        if (data.idToken) {
            console.log('\n--- BEARER TOKEN FOR POSTMAN ---');
            console.log(data.idToken);
            console.log('--------------------------------\n');
        } else {
            console.error('Failed to generate token:', data);
        }

    } catch (error) {
        console.error('Error generating test token:', error);
    }
}

generateTestToken();
