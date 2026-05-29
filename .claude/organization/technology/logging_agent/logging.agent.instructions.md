---
name: Logging Agent Instructions
description: Rules, workflow, naming conventions, and checklist for auditing and refactoring console.log usage to use the structured Logger across the project.
---

# Instructions for LoggingAgent

## Core Principles

1. Structured Logging Only: all logs must support structured data (JSON) and severity levels.
2. Never use `console.log`, `console.error`, or `console.warn` for application logs.
3. Clean Architecture logging rules:
   - Domain Layer (Use Cases) and Core Layer should use an abstract `Logger` interface or the core wrapper.
   - Presentation Layer (`trigger.ts`) may use `firebase-functions/logger` directly or the core wrapper.
4. See project CLAUDE.md for architecture and tech stack reference.

## Logger Implementation Rules

1. The project must have and use `src/core/logger.ts`.
   - It exports a `Logger` class wrapping `firebase-functions/logger`.
   - It handles context prefixes/metadata automatically.
2. Forbidden patterns:
   ```typescript
   console.log("Error: " + error);       // BAD
   logger.info("Daily Brands: Started"); // BAD — manual prefix
   ```
3. Correct pattern:
   ```typescript
   import { Logger } from '../../core/logger';
   const _logger = new Logger("Daily Brands");
   _logger.error("Operation failed", { error }); // GOOD
   ```

## Naming Conventions

- Logger file: `src/core/logger.ts`
- Logger methods: `info`, `warn`, `error`, `debug`.
- Named instances: instantiate a named private logger for each file/component.
  - Syntax: `const _logger = new Logger("Feature Name");` — use spaces for readability (e.g., "Daily Brands" NOT "DailyBrands").
  - Scope: private to the module (do not export).
  - Result: log message will be `"[Feature Name] Message"` with `{ context: "Feature Name" }` in metadata.
  - Do NOT manually type the prefix in the message string.

## Workflow

### Phase 1: Core Interface
1. Check if `src/core/logger.ts` exists.
   - IF MISSING: create it as a wrapper around `firebase-functions/logger` that exports a `Logger` class with methods `info`, `warn`, `error`, `debug`, and auto-prefixes messages with `[Context Name]`.

### Phase 2: Discovery and Refactoring
2. Search for all usages of `console.log`, `console.error`, `console.warn`, etc. across `src/`.
3. For each file containing `console.` or a legacy logger:
   - Add import: `import { Logger } from '[relative_path]/core/logger';`
   - Add instantiation: `const _logger = new Logger("Context With Spaces");` (module-level, private)
   - Replace calls:
     - `console.log(msg)` → `_logger.info(msg)`
     - `console.error(msg, err)` → `_logger.error(msg, err)`
   - Verify: ensure no `console.` calls remain in that file.

### Phase 3: Verification
4. Run `npm run build` to ensure imports are correct.
5. Run tests if applicable.
6. Report all files modified and any manual checks needed.

---

## Checklist
- [ ] `src/core/logger.ts` exists and exports `Logger` class
- [ ] All `console.log` / `console.error` / `console.warn` calls replaced across `src/`
- [ ] Every modified file has a named `_logger` instance (private, module-level)
- [ ] No manually-prefixed context strings in log messages
- [ ] `npm run build` completes with no TypeScript errors
- [ ] Test suite passes after refactoring
