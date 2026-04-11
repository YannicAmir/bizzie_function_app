---
description: Setup and initialize the Bizzie Function App project with GenAI readiness
---

# Project Setup Agent

**Role:** You are **Project Setup Agent**

This workflow initializes the Bizzie Function App, populates core utilities for Vertex AI & Remote Config, and sets up Git.

**Technology Stack:** Please refer to the [Technology Stack Guide](../rules/tech-stack-rules.md) for details and strictly follow the technologies listed there

**Architecture Stack:** Please refer to the [Architecture Guide](../rules/architecture-rules.md) for details and strictly follow the technologies listed there

1.  Initialize NPM project & Install Dependencies
    ```bash
    npm init -y
    npm install firebase-functions@latest firebase-admin@latest @google-cloud/vertexai zod
    npm install --save-dev typescript eslint google-ts-style firebase-functions-test jest ts-jest @types/jest
    ```

2.  Initialize TypeScript & Git
    ```bash
    # 1. Initialize Git and Ignore Rules
    git init
    
    cat <<EOF > .gitignore
    node_modules/
    lib/
    .firebase/
    firebase-debug.log
    .DS_Store
    .env
    EOF

    # 2. Configure TypeScript (Strict but CommonJS compatible)
    # Note: explicitly setting include/exclude to preventing 'tsc' from hanging on node_modules
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

3.  Create Directory Structure & Populate Core Utilities
    ```bash
    # 1. Create Directories & Project Config
    mkdir -p src/core src/features src/tests/features
    touch src/index.ts

    cat <<EOF > src/core/config.ts
    export const config = {
      location: process.env.LOCATION || 'us-central1',
      projectId: process.env.GCLOUD_PROJECT || process.env.PROJECT_ID || '',
    };
    EOF

    # 2. Firebase Admin (Singleton)
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
    ```

    **3a. Populate Core Utilities (AI & Remote Config)**
    ```bash
    # 3. Vertex AI (Gemini Singleton)
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

    # 4. Remote Config (Helpers)
    cat <<EOF > src/core/remote-config.ts
    import { getFirebaseAdmin } from './firebase';

    export const getRemoteConfig = () => {
      return getFirebaseAdmin().remoteConfig();
    };

    export const publishTemplate = async (template: any) => {
      const rc = getRemoteConfig();
      // Validate or safely merge before publishing in real apps
      return rc.publishTemplate(template);
    };

    export const getTemplate = async () => {
      const rc = getRemoteConfig();
      return rc.getTemplate();
    };
    EOF
    ```

    **3b. Populate Core Utilities (Logger & Secrets)**
    ```bash
    # 5. Logger & Secrets (Placeholders)
    cat <<EOF > src/core/logger.ts
    import { logger } from 'firebase-functions';
    export const log = logger;
    EOF
    
    cat <<EOF > src/core/secrets.ts
    // Define secret names here to be used with defineSecret()
    export const OPENAI_API_KEY = 'OPENAI_API_KEY'; // Example
    EOF
    ```

4.  Create Test Setup & Cloudbuild
    ```bash
    mkdir -p src/tests
    cat <<EOF > src/tests/setup.ts
    // Setup for Jest
    EOF
    
    touch cloudbuild.yaml
    ```

5.  Final instructions
    ```bash
    echo "Project setup complete. Don't forget to run 'npm run build' to verify everything compiles!"
    ```