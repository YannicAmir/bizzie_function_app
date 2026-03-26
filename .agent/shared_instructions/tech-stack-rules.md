---
name: Tech Stack Rules
description: Core technologies, libraries, and development workflow for the Bizzie Function App.
---

# Tech Stack Rules & Environment

## 1. Project Identity
* **Project Name:** Bizzie Function App
* **IDE:** Antigravity (Google Internal/Cloud IDE)
* **Environments:**
    * `dev` (Bizzie Dev)
    * `qa` (Bizzie QA)
    * `prod` (Bizzie Prod)

## 2. Core Technologies
* **Runtime:** Node.js 20 (Target `es2020` or higher).
* **Language:** TypeScript 5.x (Strict mode enabled).
* **Platform:** Google Cloud Functions (2nd Gen).

## 3. Libraries & SDKs (The "Golden Path")
Use these specific packages. Do not introduce alternatives without approval.

| Category | Package Name | Usage Notes |
| :--- | :--- | :--- |
| **Framework** | `firebase-functions` | Use **v2** imports: `firebase-functions/v2/*` |
| **Admin SDK** | `firebase-admin` | For Firestore, Auth, and Remote Config access |
| **AI / LLM** | `@google-cloud/vertexai` | Direct access to Gemini 1.5 Flash/Pro |
| **Logging** | `firebase-functions/logger` | **MANDATORY**: Use `src/core/logger.ts` wrapper. No `console.log`. |
| **Validation** | `zod` | (Optional) For validating API inputs or JSON from AI |

## 4. Implementation Details

### A. Functions Generation 2
* ALWAYS explicitly set memory and timeout for AI functions.
* Example: `{ memory: '1GiB', timeoutSeconds: 540 }`.

### B. Vertex AI (Gemini)
* **Model:** `gemini-1.5-flash` (Default for speed/cost).
* **Output:** Use `responseMimeType: "application/json"` for all data generation tasks.
* **Location:** `us-central1` (Standard for Vertex AI).

### C. Environment Variables
* Access variables via `process.env`.
* **GCLOUD_PROJECT**: Provided automatically by the runtime.
* **PROJECT_ID**: Use for conditional logic between Dev/QA/Prod.

## 5. Development Workflow (Antigravity)
* **Package Manager:** `npm`
* **Build Command:** `npm run build` (Compiles TS to JS).
* **Linting:** `npm run lint` (ESLint).
* **Testing:** `npm test` (Jest - optional but recommended).
