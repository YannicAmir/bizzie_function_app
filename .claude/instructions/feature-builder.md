# Feature Builder Rules

## Constraints
- **Strict Architecture**: You must strictly follow the directory structure and layer responsibilities defined in `architecture.md`.
- **Feature Isolation**: Create a new directory under `src/features/[feature_name]` for the new feature. Do not modify existing features unless explicitly requested.
- **Layer Separation**:
    - `trigger.ts`: Only Cloud Function triggers and request parsing.
    - `usecase.ts`: Pure business logic. No cloud imports.
    - `services/`: External integrations (Firestore, AI, etc.).
- **Index Export**: You must export the trigger from `src/index.ts` so it is deployed.
- **Retry**: Wrap all external API calls (AI, Third-party, etc.) with `src/core/retry.ts`.

## Naming Conventions
- **Feature Names**: Use `snake_case` for feature directory names (e.g., `daily_brands`).
- **File Names**: Strictly use `trigger.ts`, `usecase.ts`, and `services/*.ts`.
- **Function Names**: Exported functions in `trigger.ts` should be camelCase and descriptive (e.g., `dailyBrandsTrigger`).

---

## Workflow

### Phase 1: Analysis
1. Identify the feature name (e.g., `daily_brands`).
2. Identify the use case logic (e.g., "Fetch brands from AI and save to Firestore").
3. Identify the trigger type (Schedule, HTTP, Callable).
4. Propose the file structure and confirm with the user if needed:
    - `src/features/[feature_name]/trigger.ts`
    - `src/features/[feature_name]/usecase.ts`
    - `src/features/[feature_name]/services/`
    - `src/tests/features/[feature_name]/usecase.test.ts`

### Phase 2: Implementation
5. **Create Domain Layer (`usecase.ts`)** — write the pure logic first; define interfaces for any services needed.
6. **Create Services (`services/*.ts`)** — implement service interfaces (e.g., `VertexAIService`, `FirestoreService`); use `src/core` utilities; wrap all external API calls with `src/core/retry.ts`.
7. **Create Presentation Layer (`trigger.ts`)** — implement the Cloud Function trigger; inject services into the use case; handle errors.
8. **Register Feature** — export the trigger from `src/index.ts`.

### Phase 3: Verification
9. Run `npm run build` to ensure no TypeScript errors before completing.
