---
name: Setup Project Steps
description: Step-by-step process for initializing the Bizzie Function App project and its core structure.
---

# Setup Project Steps

Follow these phases in order to initialize a new Bizzie Function App project or baseline an existing one.

---

## Phase 1: Dependency Management

1.  **Initialize NPM**: `npm init -y`
2.  **Install Production Dependencies**:
    ```bash
    npm install firebase-functions@latest firebase-admin@latest @google-cloud/vertexai zod
    ```
3.  **Install Development Dependencies**:
    ```bash
    npm install --save-dev typescript eslint google-ts-style firebase-functions-test jest ts-jest @types/jest
    ```

---

## Phase 2: Configuration & Git

1.  **Initialize Git**: `git init`
2.  **Configure Git Ignore**: Create `.gitignore` with standard exclusions (node_modules, lib, .firebase, etc.).
3.  **Configure TypeScript**: Create `tsconfig.json` with strict mode enabled and target `es2020`.

---

## Phase 3: Directory & Core Logic

1.  **Scaffold Directories**: Create `src/core`, `src/features`, and `src/tests/features`.
2.  **Initialize Main Export**: Create `src/index.ts`.
3.  **Implement Core Utilities**:
    -   `src/core/config.ts`: Environment and project configuration.
    -   `src/core/firebase.ts`: Singleton Firebase Admin initialization.
    -   `src/core/vertex-ai.ts`: Vertex AI (Gemini) client setup.
    -   `src/core/remote-config.ts`: Remote Config helpers.
    -   `src/core/logger.ts`: Structured logging wrapper.
    -   `src/core/secrets.ts`: Secret Manager definitions.

---

## Phase 4: Testing & CI/CD Baseline

1.  **Setup Testing**: Create `src/tests/setup.ts` for Jest environment configuration.
2.  **Setup CI/CD**: Initialize `cloudbuild.yaml` for Google Cloud Build.

---

## Phase 5: Final Verification

1.  **Run Build**: `npm run build`
2.  **Validate Compilation**: Ensure no TypeScript errors before completing.

---

## Verification Checklist

- [ ] `package.json` contains required dependencies.
- [ ] `tsconfig.json` is strictly configured for `es2020`.
- [ ] Core directory structure (`src/core`, `src/features`) exists.
- [ ] Core utility singletons are implemented correctly.
- [ ] `.gitignore` prevents sensitive/binary files from being tracked.
- [ ] `npm run build` passes without errors.
- [ ] All paths are project-root-relative.
