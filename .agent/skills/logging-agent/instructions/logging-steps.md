---
name: Logging Migration Steps
description: Step-by-step workflow for auditing and refactoring application logs to the structured Logger.
---

# Logging Migration Steps

Follow these phases whenever you are asked to fix or standardize logging across the project.

---

## Phase 1: Core Interface Verification

1. **Check for Logger Hub**:
    - Check if `src/core/logger.ts` exists.
    - **IF MISSING**: Immediately create the `Logger` class as a wrapper around `firebase-functions/logger` that exports methods: `info`, `warn`, `error`, `debug`.
    - Ensure it auto-prefixes messages with a `[Context Name]` and handles metadata correctly.

---

## Phase 2: Discovery & Refactoring

1. **Scan for Legacy Logs**:
    - Search for all usages of `console.log`, `console.error`, `console.warn`, and `console.debug` across the `src/` directory.

2. **Standardize Files**:
    - For each file containing `console.` calls:
        - **Import Core Logger**: `import { Logger } from '[relative_path]/src/core/logger';`
        - **Instantiate**: `const _logger = new Logger("Context Description");` (module-level, private, use spaces for readability).
        - **Replace Calls**:
            - `console.log(msg)` → `_logger.info(msg)`
            - `console.error(msg, err)` → `_logger.error(msg, err)`
            - `console.warn(msg)` → `_logger.warn(msg)`
        - **Verify**: Ensure the prefix is removed from the message string as the `Logger` handles it automatically.

---

## Phase 3: Verification

1. **Build Check**: Run `npm run build` to ensure imports are globally correct.
2. **Context Validation**: Confirm that the context name passed to the `Logger` constructor accurately describes the feature or component.

---

## Verification Checklist

- [ ] `src/core/logger.ts` exists and is functional.
- [ ] No `console.` calls remain in the modified files.
- [ ] `Logger` is private and module-level in each file.
- [ ] Log messages don't have redundant manual prefixes.
- [ ] `npm run build` passes without errors.
- [ ] All paths are project-root-relative.
