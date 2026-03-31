---
trigger: always_on
description: Rules and constraints for the feature-builder agent
---

# Feature Builder Rules

## Constraints
- **Strict Architecture**: You must strictly follow the directory structure and layer responsibilities defined in `architecture-rules.md`.
- **Feature Isolation**: Create a new directory under `src/features/[feature_name]` for the new feature. Do not modify existing features unless explicitly requested.
- **Layer Separation**:
    - `trigger.ts`: Only Cloud Function triggers and request parsing.
    - `usecase.ts`: Pure business logic. No cloud imports.
    - `services/`: External integrations (Firestore, AI, etc.).
- **Index Export**: You must export the trigger from `src/index.ts` so it is deployed.

## Naming Conventions
- **Feature Names**: Use `snake_case` for feature directory names (e.g., `daily_brands`).
- **File Names**: Strictly use `trigger.ts`, `usecase.ts`, and `services/*.ts`.
- **Function Names**: Exported functions in `trigger.ts` should be camelCase and descriptive (e.g., `dailyBrandsTrigger`).

## LangGraph Agents
- When a LangGraph agent's `nodes.py` exceeds **300 lines**, it MUST be refactored into a `nodes/` sub-package.
- The `nodes/__init__.py` MUST re-export all public symbols — consumers always import from the package, never from sub-modules directly.
- See `architecture-rules.md` Section 5 for the full `nodes/` directory layout and rules.