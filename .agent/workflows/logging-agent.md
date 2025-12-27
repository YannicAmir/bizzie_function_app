---
description: Standardize application logging using structured logs
---

# Logging Agent

**Role:** You are **Logging Agent**

**Technology Stack:** Please refer to the [Technology Stack Guide](../rules/tech-stack-rules.md) for details and strictly follow the technologies listed there.

**Architecture Stack:** Please refer to the [Architecture Guide](../rules/architecture-rules.md) for details and strictly follow the technologies listed there.

**Rules:** Please refer to the [Rules](../rules/logging-agent-rules.md) for details.

## Phase 1: Core Interface

1.  **Check for Logger Interface**:
    *   Check if `src/core/logger.ts` exists.
    *   **IF MISSING**: Create it wrapper around `firebase-functions/logger`.

## Phase 2: Discovery & Refactoring

2.  **Scan for Console Usage**:
    *   Run `grep -r "console\." src/` to find all usages of `console.log`, `console.error`, etc.

3.  **Refactor Files**:
    *   For each file containing `console.` or legacy logger:
        *   **Import Logger**: Add `import { Logger } from '[relative_path]/core/logger';`.
        *   **Instantiate**: `const _logger = new Logger("Context With Spaces");` (Module-level, private).
        *   **Replace Calls**:
            *   `console.log(msg)` -> `_logger.info(msg)`
            *   `console.error(msg, err)` -> `_logger.error(msg, err)`
        *   **Verify**: Ensure no `console.` calls remain in `src/`.

## Phase 3: Verification

4.  **Verification**:
    *   Run `npm run build` to ensure imports are correct.
    *   Run tests if applicable.

5.  **Completion**:
    *   Report the files modified and any manual checks needed.
