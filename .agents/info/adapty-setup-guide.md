# Adapty Setup Guide (Manual Steps)

This guide will help you set up Adapty to work with your "Secure Backend" architecture. You can do this *before* having the mobile app ready.

## 1. Create Adapty Account
1.  Go to [Adapty.io](https://adapty.io) and Sign Up.
2.  Create a new App (e.g., "Bizzie").

## 2. Configure Platforms (Placeholders)
Adapty needs to talk to Apple/Google. Even if you don't have the app yet, you can set the groundwork.
1.  **iOS Settings**: In Adapty Dashboard -> App Settings -> iOS.
    *   You will eventually need your **App Store Shared Secret**.
    *   *For now*: You can skip this or put a placeholder if allowed, but you won't be able to test "Real" purchases until this is set.

## 3. Generate Secret Key (For Our Webhook)
We need a secret password so your Backend knows the webhook is truly from Adapty.
1.  Go to **Integrations** in the Adapty Dashboard.
2.  Select **Webhooks** (or "Custom Webhook").
3.  You will see a field for **Destination URL**.
    *   *Leave this blank for now*. We will generate this URL after we deploy our Cloud Function.
4.  Look for **Authorization Header** or **Secret Key**.
    *   Create a strong password (e.g., `adapty_secret_12345`).
    *   **SAVE THIS**. We will need to put this in your `.env` or `src/core/secrets.ts`.

## 4. (Optional) Create Products
You can define your subscription products now so they are ready.
1.  Go to **Products**.
2.  Create a product (e.g., `premium_monthly`). 
    *   **App Store Product ID**: Must match what you eventually put in App Store Connect (e.g., `com.bizzie.premium.monthly`).

---
**Next Steps**:
Once I build the `subscription_webhook` feature, I will give you a URL (e.g., `https://us-central1-bizzie.cloudfunctions.net/adaptyWebhook`). You will paste that into the **Destination URL** in Step 3.
