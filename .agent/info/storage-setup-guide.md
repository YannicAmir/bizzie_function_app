# Firebase Storage Setup Guide

This guide outlines the manual steps and security rules required for the Bizzie Function App's storage features to work across environments.

## 1. Initial Project Setup
When creating a new Firebase project (QA, Prod, or a New Dev environment), you must manually initialize Storage.

1.  Navigate to **Build > Storage** in the Firebase Console.
2.  Click **"Get started"**.
3.  Select **"Start in production mode"** (even for Dev).
4.  Choose the region **`us-central1`** to match the Cloud Functions.
5.  If prompted, click **"Repair project permissions"** or **"Attach permissions"**.

## 2. Security Rules
The following rules must be applied in the **Rules** tab of the Firebase Storage console. This allows the mobile app to read system files while keeping other data private.

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    
    // 🔒 Only logged in users can READ the stock list for search suggestions
    match /system_data/{allPaths=**} {
      allow read: if request.auth != null;
    }
    // 🔒 Keep everything else private by default
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

## 3. Backend Access
Cloud Functions use the **Firebase Admin SDK**, which bypasses these security rules. No additional rules are needed for the backend to upload files.

## 4. Verification
After applying rules and running the `stockListSync` function, verify the file exists at:
`gs://[PROJECT_ID].firebasestorage.app/system_data/stock_list.json`
