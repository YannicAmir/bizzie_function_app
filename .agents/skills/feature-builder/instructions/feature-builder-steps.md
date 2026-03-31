---
name: Feature Builder Steps
description: Step-by-step process for analyzing, implementing, and verifying a new backend feature.
---

# Feature Builder Steps

Follow these phases whenever you are asked to create a new backend feature or Cloud Function.

---

## Phase 1: Analysis & Strategy

1.  **Analyze Request**:
    - Identify the feature name (e.g., `daily_brands`).
    - Identify the use case logic (e.g., "Fetch brands from AI and save to Firestore").
    - Identify the trigger type (Schedule, HTTP, Callable).
2.  **Define Strategy**:
    - Determine which services are needed (Firestore, AI, etc.).
    - Define the file structure:
        - `src/features/[feature_name]/trigger.ts`
        - `src/features/[feature_name]/usecase.ts`
        - `src/features/[feature_name]/services/`
        - `src/tests/features/[feature_name]/usecase.test.ts`
3.  **Confirm with User**: Present the proposed structure and logic for confirmation.

---

## Phase 2: Implementation

1.  **Create Domain Layer (`usecase.ts`)**:
    - Write the pure business logic first.
    - Define interfaces for any services required.
2.  **Create Services (`services/*.ts`)**:
    - Implement the service interfaces.
    - **MUST** wrap all external API calls with `src/core/retry.ts`.
    - Use `src/core/logger.ts` for structured logging.
3.  **Create Presentation Layer (`trigger.ts`)**:
    - Implement the Cloud Function trigger.
    - Inject services into the use case.
    - Handle and log errors at the top level.
4.  **Register Feature**:
    - Export the trigger from `src/index.ts`.

---

## Phase 3: Verification

1.  **Run Build**: Ensure `npm run build` passes with no TypeScript errors.
2.  **Validate Structure**: Confirm files match the reference tree in the architecture rules.

---

## Verification Checklist

- [ ] Feature files are placed correctly in `src/features/[name]/`.
- [ ] Use Case contains pure business logic with no cloud imports.
- [ ] All external API calls are wrapped in `retry.ts`.
- [ ] Feature trigger is exported from `src/index.ts`.
- [ ] `npm run build` passes without errors.
- [ ] All paths are project-root-relative.
