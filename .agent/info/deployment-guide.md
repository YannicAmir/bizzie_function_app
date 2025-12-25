# Beginner's Guide: Hosting & Deploying Bizzie Functions

## 1. The "No Backend" Concept (Serverless)
This project is a **Cloud Functions** app. Google Cloud *is* your host. Since you already have Firebase projects for your mobile app (Dev, QA, Prod), you will simply "deploy" this code to those exact same projects. The functions will live side-by-side with your mobile app's database and auth.

## 2. Prerequisites (The "One-Time" Setup)
Since you **already have** the 3 Firebase projects, you just need to enable the "Functions" capability on them.

### Step A: Enable Functions (Web Console)
For **each** of your 3 projects (Dev, QA, Prod):
1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Select the project.
3.  Go to **Build > Functions** and click "Get Started".
4.  **Important:** Ensure the project is on the **Blaze Plan (Pay as you go)**.
    *   *Why?* Cloud Functions require the Blaze plan. You usually won't be charged for testing, but a card is required or the deploy will fail.

### Step B: Enable AI (Web Console)
For **each** project where you want to use Gemini:
1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Select your Bizzie project.
3.  Search for "Vertex AI API" and enable it.

## 3. How to Deploy (Your Daily Workflow)
Your code on this computer needs to know which "Bizzie" (Dev, QA, or Prod) to talk to.

### Safety First: Check where you are
Always run this before deploying to verify you are targeting the right environment:
```bash
firebase use
```
*It will print: `Active Project: bizzie-dev` (or similar).*

### The Magic Command
To upload your code to the active project:
```bash
firebase deploy --only functions
```

## 4. How the App "Talks" to the Functions
*   **Scheduled Functions:** Run automatically in the cloud.
*   **App Calls:** Your Flutter app works exactly the same. It is already connected to Firebase. You just call:
    ```dart
    FirebaseFunctions.instance.httpsCallable('myFunction').call();
    ```

## 5. Summary of Manual Steps
1.  **Login** (`firebase login`).
2.  **Add Aliases** (Link `dev`, `qa`, `prod` to your real project IDs).
3.  **Select Environment** (`firebase use dev` or `firebase use prod`).
4.  **Deploy** (`firebase deploy`).
