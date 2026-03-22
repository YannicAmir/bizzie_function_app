# Setup Project Rules

## Constraints
- Run all setup commands in order — each step depends on the previous.
- Use exact package versions from the commands below unless the user specifies otherwise.
- Never skip `npm run build` at the end — the setup is not complete until it compiles clean.

---

## Workflow

### Step 1: Install Dependencies
```bash
npm init -y
npm install firebase-functions@latest firebase-admin@latest @google-cloud/vertexai zod
npm install --save-dev typescript eslint google-ts-style firebase-functions-test jest ts-jest @types/jest
```

### Step 2: Initialize TypeScript & Git
```bash
git init

cat <<EOF > .gitignore
node_modules/
lib/
.firebase/
firebase-debug.log
.DS_Store
.env
EOF

cat <<EOF > tsconfig.json
{
  "compilerOptions": {
    "module": "commonjs",
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "outDir": "lib",
    "sourceMap": true,
    "strict": true,
    "target": "es2020",
    "verbatimModuleSyntax": false
  },
  "compileOnSave": true,
  "include": [
    "src"
  ],
  "exclude": [
    "node_modules",
    "lib",
    "**/*.spec.ts"
  ]
}
EOF
```

### Step 3: Create Directory Structure & Core Utilities
```bash
mkdir -p src/core src/features src/tests/features
touch src/index.ts

cat <<EOF > src/core/config.ts
export const config = {
  location: process.env.LOCATION || 'us-central1',
  projectId: process.env.GCLOUD_PROJECT || process.env.PROJECT_ID || '',
};
EOF

cat <<EOF > src/core/firebase.ts
import * as admin from 'firebase-admin';

let initialized = false;

export const getFirebaseAdmin = () => {
  if (!initialized) {
    admin.initializeApp();
    initialized = true;
  }
  return admin;
};
EOF

cat <<EOF > src/core/vertex-ai.ts
import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import { config } from './config';

let vertexAiInstance: VertexAI | null = null;

export const getVertexAI = (): VertexAI => {
  if (!vertexAiInstance) {
    vertexAiInstance = new VertexAI({
      project: config.projectId,
      location: config.location,
    });
  }
  return vertexAiInstance;
};

export const getGeminiModel = (modelName: string = 'gemini-1.5-flash'): GenerativeModel => {
  const vertex = getVertexAI();
  return vertex.getGenerativeModel({ model: modelName });
};
EOF

cat <<EOF > src/core/remote-config.ts
import { getFirebaseAdmin } from './firebase';

export const getRemoteConfig = () => {
  return getFirebaseAdmin().remoteConfig();
};

export const publishTemplate = async (template: any) => {
  const rc = getRemoteConfig();
  return rc.publishTemplate(template);
};

export const getTemplate = async () => {
  const rc = getRemoteConfig();
  return rc.getTemplate();
};
EOF

cat <<EOF > src/core/logger.ts
import { logger } from 'firebase-functions';
export const log = logger;
EOF

cat <<EOF > src/core/secrets.ts
// Define secret names here to be used with defineSecret()
export const OPENAI_API_KEY = 'OPENAI_API_KEY'; // Example
EOF
```

### Step 4: Create Test Setup & Cloudbuild
```bash
mkdir -p src/tests
cat <<EOF > src/tests/setup.ts
// Setup for Jest
EOF

touch cloudbuild.yaml
```

### Step 5: Verify
```bash
npm run build
```
Ensure no TypeScript errors before completing.
