---
name: Setup Project Instructions
description: Ordered steps, exact commands, and core utility templates for initializing a new Bizzie Function App from scratch.
---

# Instructions for SetupProject

## Constraints

1. Run all setup steps in order — each step depends on the previous.
2. Use exact package versions from the commands below unless the user specifies otherwise.
3. Never skip `npm run build` at the end — the setup is not complete until it compiles clean.
4. See project CLAUDE.md for architecture and tech stack reference.

## Workflow

### Step 1: Install Dependencies
```bash
npm init -y
npm install firebase-functions@latest firebase-admin@latest @google-cloud/vertexai zod
npm install --save-dev typescript eslint google-ts-style firebase-functions-test jest ts-jest @types/jest
```

### Step 2: Initialize TypeScript and Git
```bash
git init
```

Create `.gitignore`:
```
node_modules/
lib/
.firebase/
firebase-debug.log
.DS_Store
.env
```

Create `tsconfig.json`:
```json
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
  "include": ["src"],
  "exclude": ["node_modules", "lib", "**/*.spec.ts"]
}
```

### Step 3: Create Directory Structure and Core Utilities
```bash
mkdir -p src/core src/features src/tests/features
touch src/index.ts
```

Create `src/core/config.ts`:
```typescript
export const config = {
  location: process.env.LOCATION || 'us-central1',
  projectId: process.env.GCLOUD_PROJECT || process.env.PROJECT_ID || '',
};
```

Create `src/core/firebase.ts`:
```typescript
import * as admin from 'firebase-admin';

let initialized = false;

export const getFirebaseAdmin = () => {
  if (!initialized) {
    admin.initializeApp();
    initialized = true;
  }
  return admin;
};
```

Create `src/core/vertex-ai.ts`:
```typescript
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
```

Create `src/core/remote-config.ts`:
```typescript
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
```

Create `src/core/logger.ts`:
```typescript
import { logger } from 'firebase-functions';
export const log = logger;
```

Create `src/core/secrets.ts`:
```typescript
// Define secret names here to be used with defineSecret()
export const OPENAI_API_KEY = 'OPENAI_API_KEY'; // Example
```

### Step 4: Create Test Setup and Cloudbuild
```bash
mkdir -p src/tests
touch src/tests/setup.ts
touch cloudbuild.yaml
```

### Step 5: Verify
```bash
npm run build
```
Ensure no TypeScript errors before completing.

---

## Checklist
- [ ] `npm init -y` run
- [ ] Production and dev dependencies installed
- [ ] `git init` run and `.gitignore` created
- [ ] `tsconfig.json` created with strict mode
- [ ] `src/core/`, `src/features/`, `src/tests/features/` directories created
- [ ] `src/index.ts` created
- [ ] `src/core/config.ts` created
- [ ] `src/core/firebase.ts` created
- [ ] `src/core/vertex-ai.ts` created
- [ ] `src/core/remote-config.ts` created
- [ ] `src/core/logger.ts` created
- [ ] `src/core/secrets.ts` created
- [ ] `src/tests/setup.ts` and `cloudbuild.yaml` created
- [ ] `npm run build` completes with no TypeScript errors
