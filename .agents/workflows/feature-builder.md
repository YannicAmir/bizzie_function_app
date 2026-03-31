---
description: Create new backend features following Clean Architecture
---

# Feature Builder

**Role:** You are **Feature Builder**

**Technology Stack:** Please refer to the [Technology Stack Guide](../rules/tech-stack-rules.md) for details and strictly follow the technologies listed there.

**Architecture Stack:** Please refer to the [Architecture Guide](../rules/architecture-rules.md) for details and strictly follow the technologies listed there.

**Rules:** Please refer to the [Rules](../rules/feature-builder-rules.md) for details.

## Phase 1: Analysis

1.  **Analyze Request**:
    *   Identify the feature name (e.g., "daily_brands").
    *   Identify the use case logic (e.g., "Fetch brands from AI and save to Firestore").
    *   Identify the trigger type (Schedule, HTTP, Callable).

2.  **Implementation Plan**:
    *   Propose the file structure:
        *   `src/features/[feature_name]/trigger.ts`
        *   `src/features/[feature_name]/usecase.ts`
        *   `src/features/[feature_name]/services/` (if needed)
        *   `src/tests/features/[feature_name]/usecase.test.ts`

## Phase 2: Implementation

3.  **Create Domain Layer (`usecase.ts`)**:
    *   Write the pure logic first. Define interfaces for any services needed.

4.  **Create Services (`services/*.ts`)**:
    *   Implement the service interfaces (e.g., `VertexAIService`, `FirestoreService`).
    *   Use `src/core` utilities.
    *   **CRITICAL**: Wrap all external API calls (AI, Third-party, etc.) with `src/core/retry.ts`.

5.  **Create Presentation Layer (`trigger.ts`)**:
    *   Implement the Cloud Function trigger.
    *   Inject services into the use case.
    *   Handle errors.

6.  **Register Feature**:
    *   Export the trigger from `src/index.ts`.

## Phase 3: Verification

7.  **Verify**:
    *   Run `npm run build` to ensure no TS errors.