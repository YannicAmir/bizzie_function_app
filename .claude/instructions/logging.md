# Logging Rules

## Core Principles
1. **Structured Logging Only:** All logs must support structured data (JSON) and severity levels.
2. **No Console:** Do NOT use `console.log`, `console.error`, or `console.warn` for application logs.
3. **Clean Architecture:**
    * The **Domain Layer** (Use Cases) and **Core Layer** should use an abstract `Logger` interface or a generic wrapper, not directly depend on `firebase-functions` if generic portability is desired (though `firebase-functions/logger` is acceptable in `src/core`).
    * **Presentation Layer** (`trigger.ts`) may use `firebase-functions/logger` directly or the core wrapper.

## Implementation Constraints
1. **The Wrapper:** You must create and use `src/core/logger.ts`.
    * It should export a `Logger` class that wraps `firebase-functions/logger`.
    * It must handle context prefixes/metadata automatically.
2. **Forbidden Patterns:**
    ```typescript
    console.log("Error: " + error); // BAD
    logger.info("Daily Brands: Started"); // BAD (Manual prefix)
    ```
3. **Allowed Patterns:**
    ```typescript
    import { Logger } from '../../core/logger';
    const _logger = new Logger("Daily Brands");
    _logger.error("Operation failed", { error }); // GOOD
    ```

## Naming Conventions
- File: `src/core/logger.ts`
- Methods: `info`, `warn`, `error`, `debug`.
- **Named Instances:** You MUST instantiate a named logger for each file/component.
    * **Syntax:** `const _logger = new Logger("Feature Name");` (Use spaces for readability, e.g. "Daily Brands" NOT "DailyBrands").
    * **Scope:** Private to the module (do not export).
    * **Usage:** `_logger.info("Message");`
    * **Result:** Log message will be `"[Feature Name] Message"` and metadata will include `{ context: "Feature Name" }`.
    * **Do NOT** manually type the prefix in the message string anymore.

---

## Workflow (Logging Agent)

### Phase 1: Core Interface

1. **Check for Logger Interface**:
    - Check if `src/core/logger.ts` exists.
    - **IF MISSING**: Create it as a wrapper around `firebase-functions/logger` that exports a `Logger` class with methods `info`, `warn`, `error`, `debug`, and auto-prefixes messages with `[Context Name]`.

### Phase 2: Discovery & Refactoring

2. **Scan for Console Usage**:
    - Search for all usages of `console.log`, `console.error`, etc. across `src/`.

3. **Refactor Files**:
    - For each file containing `console.` or a legacy logger:
        - **Import Logger**: `import { Logger } from '[relative_path]/core/logger';`
        - **Instantiate**: `const _logger = new Logger("Context With Spaces");` (module-level, private)
        - **Replace Calls**:
            - `console.log(msg)` → `_logger.info(msg)`
            - `console.error(msg, err)` → `_logger.error(msg, err)`
        - **Verify**: Ensure no `console.` calls remain in that file.

### Phase 3: Verification

4. Run `npm run build` to ensure imports are correct.
5. Run tests if applicable.
6. Report all files modified and any manual checks needed.
