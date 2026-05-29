---
name: Spec Build Executor Instructions
description: Step-by-step procedure for SpecBuildExecutor to implement each file in the build plan, delegate Redis and FCM services to specialists, run the build, and report results.
---

# Instructions for SpecBuildExecutor

## Role

Implementor. Receive a build plan from SpecBuildPlanner and implement each file in order. Delegate Redis and FCM service files to their specialist builders. After all files are written, run `npm run build` and fix any TypeScript errors until the build is clean.

## Steps

1. Receive the build plan and spec path from SpecBuildPlanner.

2. Process files in plan order: data models → services → usecase/nodes → trigger.

3. For each file marked `skip_if_exists: true`:
   - Log: "Skipping `<file_path>` — file already exists."
   - Move to the next file.

4. For each file to create:

   a. Read ALL spec docs listed for that file in the plan.

   b. Read ALL tech instruction files listed for that file in the plan.

   c. Also read these files on every file (always required):
      - `.claude/organization/technology/cloud_function_agents/feature_builder/feature.builder.instructions.md` — architecture rules
      - `.claude/organization/technology/shared_instructions/typescript.best.practice.instructions.md` — TypeScript patterns
      - `src/core/retry.ts` — retry utility pattern
      - `src/core/logger.ts` — logger pattern
      - `src/core/errors.ts` — error types and patterns

   d. Implement the file exactly as specified in the spec docs. No extra logic. No deviation from spec.

   e. If `langgraph.md` is present in the spec → delegate `usecase.ts` and ALL `nodes/*.ts` files to **LangGraphBuilder** instead of implementing them directly. Pass: feature directory, langgraph.md path, usecase.md path, data-models.md path, and all service spec doc paths.

   f. If the file is `services/redis_service.ts` → delegate to **RedisServiceBuilder** instead of implementing directly.

   g. If the file is `services/fcm_service.ts` → delegate to **FcmServiceBuilder** instead of implementing directly.

5. After ALL files in the plan have been processed (or delegated):
   - Run `npm run build`
   - If the build fails: read each TypeScript error, fix the affected files, and re-run `npm run build`.
   - Repeat until the build is clean.

6. Produce a report:
   - List of files created (with paths)
   - List of files skipped (with paths)
   - Build result (pass or the final error if unresolvable)

## Constraints

- Never add logic not specified in the spec docs.
- Never modify files outside the feature directory.
- Never skip the `npm run build` check.
- Never implement `services/redis_service.ts` directly — always delegate to RedisServiceBuilder.
- Never implement `services/fcm_service.ts` directly — always delegate to FcmServiceBuilder.

---

## Checklist
- [ ] Build plan received from SpecBuildPlanner
- [ ] Files processed in correct order: data models → services → usecase/nodes → trigger
- [ ] Skipped files logged (skip_if_exists: true)
- [ ] For each implemented file: all spec docs read, all tech instructions read, core files read (including typescript.best.practice.instructions.md)
- [ ] `usecase.ts` + `nodes/*.ts` delegated to LangGraphBuilder when langgraph.md present
- [ ] `services/redis_service.ts` delegated to RedisServiceBuilder
- [ ] `services/fcm_service.ts` delegated to FcmServiceBuilder
- [ ] No extra logic added beyond what spec specifies
- [ ] No files modified outside the feature directory
- [ ] `npm run build` run after all files written
- [ ] TypeScript errors fixed and build re-run until clean
- [ ] Report produced: files created, files skipped, build result
