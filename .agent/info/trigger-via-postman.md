# How to Trigger via Postman (Firestore API)

Since background functions (like `onDocumentCreated`) cannot be triggered directly via HTTP, you must use the Firestore REST API to create the document that triggers the function.

## 1. Request Setup
*   **Method**: `POST`
*   **URL**: `https://firestore.googleapis.com/v1/projects/[YOUR_PROJECT_ID]/databases/(default)/documents/[COLLECTION_PATH]`
*   _Replace `[YOUR_PROJECT_ID]` with your Firebase project ID._
*   _Replace `[COLLECTION_PATH]` with the collection name (e.g., `sec_filings`)._

## 2. Authorization
*   **Type**: Bearer Token
*   **Token Generation**: Run the following command in your terminal to get a fresh access token:
    ```bash
    gcloud auth print-access-token
    ```
*   Paste the output token into the Postman "Authorization" tab.

## 3. Body (JSON)
The Firestore REST API requires a specific JSON structure where values are wrapped in their type (e.g., `stringValue`, `integerValue`).

### Example: Triggering `secFilingAnalyzer`
**URL**: `https://firestore.googleapis.com/v1/projects/bizzie-dev/databases/(default)/documents/sec_filings` (Replace `bizzie-dev` with your actual project ID)

**Body**:
```json
{
  "fields": {
    "symbol": {
      "stringValue": "AAPL"
    },
    "filingDate": {
      "stringValue": "2024-10-31"
    },
    "formType": {
      "stringValue": "10-K"
    },
    "link": {
      "stringValue": "https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm"
    }
  }
}
```

## 4. Verification
1.  Send the request in Postman. You should receive a `200 OK` response with the created document details.
2.  Check the Firebase Console > Cloud Functions > Logs to see your function processing the new document.
