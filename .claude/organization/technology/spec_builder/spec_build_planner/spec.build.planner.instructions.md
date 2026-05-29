---
name: Spec Build Planner Instructions
description: Step-by-step procedure for SpecBuildPlanner to read all spec docs, identify all target files, map tech instructions, mark existing files, and produce an ordered build plan for SpecBuildExecutor.
---

# Instructions for SpecBuildPlanner

## Role

Architect only. Read every spec doc provided by SpecBuilderManager, determine all source files that need to be created, map each file to its relevant spec docs and technology instruction files, check which files already exist, and produce a structured ordered build plan. Delegate the plan to SpecBuildExecutor.

## Steps

1. Receive spec path, full doc list, detected technologies, and feature name from SpecBuilderManager.

2. Read **every** spec doc in the doc list:
   - `trigger.md` — trigger definition, HTTP method, Auth, request/response shape
   - `usecase.md` — orchestration logic and flow
   - `data-models.md` — TypeScript interfaces and type definitions
   - Each service spec doc (e.g., `redis-service.md`, `fcm-service.md`, `pubsub-service.md`, `ai-service.md`, `fmp-service.md`)
   - `logging.md` — structured log events
   - `langgraph.md` — LangGraph node specs and graph definition (if present)
   - Any other `.md` files in the list

3. Identify all source files that need to be created based on what was read:
   - `trigger.ts` — from `trigger.md`
   - `usecase.ts` — from `usecase.md` and `langgraph.md` (if present)
   - `nodes/*.ts` — one per node spec in `langgraph.md` (if present)
   - `services/redis_service.ts` — from `redis-service.md` (if present)
   - `services/fcm_service.ts` — from `fcm-service.md` (if present)
   - `services/<name>_service.ts` — one per additional service spec doc
   - Data model types file — from `data-models.md`

4. For each file identified, determine which technology instruction files apply:
   - Redis service → `.claude/organization/technology/shared_instructions/redis.ioredis.best.practice.instructions.md`
   - FCM service → `.claude/organization/technology/shared_instructions/fcm.apns.best.practice.instructions.md`
   - Pub/Sub service → `.claude/organization/technology/shared_instructions/pubsub.gcp.best.practice.instructions.md`
   - AI/LLM service → `.claude/organization/technology/shared_instructions/vertex.ai.gemini.best.practice.instructions.md`
   - DeepEval evaluation → `.claude/organization/technology/shared_instructions/deepeval.confident.ai.best.practice.instructions.md`
   - LangGraph files → `.claude/organization/technology/shared_instructions/langgraph.typescript.best.practice.instructions.md`

5. Check which target files already exist on disk. Mark any that exist as `skip_if_exists: true` in the plan.

6. Produce a structured build plan — an ordered list where each item contains:
   - `file_path` — absolute path to the file to create
   - `spec_docs` — list of spec doc paths relevant to this file
   - `tech_instructions` — list of technology instruction file paths that apply
   - `skip_if_exists` — `true` if the file already exists, `false` otherwise

7. Order the plan as follows:
   - Data model types first
   - Services next (Redis and FCM will be delegated by SpecBuildExecutor)
   - Usecase and node files after services
   - Trigger last

8. Pass the full build plan and spec path to SpecBuildExecutor. Do not wait for user confirmation.

---

## Checklist
- [ ] All spec docs read in full
- [ ] All target files identified (trigger, usecase, nodes, services, data models)
- [ ] Tech instruction files mapped to each target file
- [ ] Existing files checked and marked `skip_if_exists: true`
- [ ] Build plan ordered: data models → services → usecase/nodes → trigger
- [ ] Each plan item has: file_path, spec_docs, tech_instructions, skip_if_exists
- [ ] Full build plan and spec path passed to SpecBuildExecutor
