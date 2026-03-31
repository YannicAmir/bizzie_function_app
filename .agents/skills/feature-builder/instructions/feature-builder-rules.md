---
name: Feature Builder Rules
description: Specific constraints and naming conventions for building backend features.
---

# Feature Builder Rules

## Constraints
- **Strict Architecture**: You must strictly follow the directory structure and layer responsibilities defined in the shared architecture rules.
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


