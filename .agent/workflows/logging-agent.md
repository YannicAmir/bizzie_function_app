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
    *   **IF MISSING**: Create it with the following content (or similar, strictly Typed):
    ```typescript
    import * as firebaseLogger from 'firebase-functions/logger';

    export interface Logger {
        info(message: string, data?: any): void;
        error(message: string, error?: any): void;
        warn(message: string, data?: any): void;
        debug(message: string, data?: any): void;
    }

    export const logger: Logger = {
        info: (message, data) => firebaseLogger.info(message, data),
        error: (message, error) => firebaseLogger.error(message, error),
        warn: (message, data) => firebaseLogger.warn(message, data),
        debug: (message, data) => firebaseLogger.debug(message, data),
    };
    ```

## Phase 2: Discovery & Refactoring

2.  **Scan for Console Usage**:
    *   Run `grep -r "console\." src/` to find all usages of `console.log`, `console.error`, etc.

3.  **Refactor Files**:
    *   For each file containing `console.`:
        *   **Import Logger**: Add `import { logger } from '[relative_path]/core/logger';`.
        *   **Replace Calls**:
            *   `console.log(msg)` -> `logger.info(msg)`
            *   `console.error(msg, err)` -> `logger.error(msg, err)`
        *   **Verify**: Ensure no `console.` calls remain in `src/`.

4.  **Verification**:
    *   Run `npm run build` to ensure imports are correct.
    *   Run tests if applicable.

5.  **Completion**:
    *   Report the files modified and any manual checks needed.