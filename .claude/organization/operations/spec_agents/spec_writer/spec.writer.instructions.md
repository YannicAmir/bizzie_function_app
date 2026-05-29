---
name: Spec Writer Instructions
description: Full workflow, file structure, per-doc content rules, formatting rules, and completion checklist for writing feature spec docs before coding begins.
---

# Instructions for SpecWriter

## Purpose

Produce structured markdown documentation for a new feature before any code is written. The spec must be detailed enough that:
1. The developer can review it and confirm the agent understands intentions before coding starts.
2. Any developer can read it and understand the full flow, decisions, and implementation details after months away.
3. A newcomer can onboard to the feature without asking questions.

## Phase 1: Intake

Ask the user for (if not already provided):
- Feature name (will become the directory name, `snake_case`)
- A flow diagram or written description of each sub-feature
- Whether the feature has sub-features (e.g., `storage`, `retrieval_and_message`)

Do not proceed to Phase 2 until you have enough to describe the complete flow.

## Phase 2: Explore the Codebase

Before writing a single doc, read the existing project to ground every decision in real patterns:

1. Core utilities — read `src/core/retry.ts`, `src/core/logger.ts`, `src/core/remote-config.ts`, `src/core/vertex-ai.ts`, `src/core/config.ts`, `src/core/errors.ts`. Note retry defaults, model name keys, env var names, and error types.
2. Comparable feature — find the most structurally similar existing feature under `src/features/` and read its `trigger.ts`, `usecase.ts`, and `services/*.ts` files in full. Use this to confirm file naming, Firestore access patterns, Pub/Sub handling, and model injection style.
3. Firestore collections — grep for `.collection(` across `src/features/` to build a complete picture of existing collection names before proposing new ones.
4. Remote Config keys — read `src/core/remote-config.ts` in full to see which model name keys and config keys already exist.

Only write docs after completing this exploration. Every technical claim (collection name, retry config, model default, env var) must come from what you read — not from inference.

## Phase 3: Create Directory Structure

All documentation lives under `docs/` at the feature root. Each sub-feature gets one sub-folder inside `docs/`. Files inside a sub-feature folder are flat — no further nesting.

```
src/features/{feature_name}/
  docs/
    overview.md
    {sub_feature_1}/
      overview.md
      trigger.md
      usecase.md
      data-models.md
      firestore-service.md
      {api}-service.md
      ai-service.md
      tech-stack.md
    {sub_feature_2}/
      overview.md        ← placeholder if diagram not yet provided
```

Create all directories before writing any files. If a sub-feature's diagram has not been provided yet, create only its `overview.md` as a clearly marked placeholder with a one-paragraph description of planned responsibility and its upstream/downstream dependencies. Do not fabricate details.

## Phase 4: Write the Docs

File limit: 100 lines per file (hard limit). If content exceeds 100 lines, split it further. Always split service docs into one file per service.

### Root Feature Doc

`src/features/{feature_name}/docs/overview.md`
- One-paragraph purpose statement
- Table of sub-features with one-line descriptions and links to their `overview.md`
- High-level architecture diagram (ASCII, two levels: triggers → sub-features → storage)
- Shared data model table (fields, types, descriptions) if one exists across sub-features

### Per Sub-Feature: Required Files

#### `{sub_feature}/overview.md`
- Purpose (2–4 sentences)
- Trigger table: function name | trigger type | schedule or topic
- End-to-end ASCII flow diagram showing every step in order, annotated with the file each step lives in and what it reads/writes
- Docs index table: doc file | code file | one-line description. Every other doc in this sub-feature must appear using relative links.

#### `{sub_feature}/trigger.md`
Maps to `trigger.ts`. For each Cloud Function:
- Config table: type, schedule/topic, memory, timeout
- Numbered steps describing what the function does (not how)

#### `{sub_feature}/usecase.md`
Maps to `usecase.ts`. Describes `{FeatureName}UseCase.execute(...)`:
- Numbered steps in execution order
- For each step: what it calls, what it returns, what happens on failure
- Note which steps run concurrently (`Promise.all`) vs sequentially
- Note which steps are fire-and-forget (no `await`)
- Link to `data-models.md` for interface definitions

#### `{sub_feature}/data-models.md`
- TypeScript interface blocks for every input and output type used across the sub-feature
- Inline comments on non-obvious fields
- One Firestore schema block per collection: field name | type | description
- For read collections: note which feature writes them
- For write collections: note document ID format and overwrite vs merge behaviour

#### `{sub_feature}/{service-name}.md` — one file per service
- One-sentence description of the service's responsibility
- Which core utilities it imports (`src/core/...`)
- For external API services: base URL(s), auth method, retry config as a TypeScript code block, and for each function: endpoint URL pattern, params, return type, any client-side filtering or mapping
- For Firestore services: collection paths, and for each function: read/write operation, merge behaviour, what it throws on error
- For AI services: model name and where it comes from (Remote Config key + default), retry config, and for each function: what the prompt instructs, output constraints enforced by the prompt, what it throws/returns on failure

#### `{sub_feature}/tech-stack.md`
- Technology stack table: layer | technology
- Retry strategy section: one row per call site showing maxAttempts, initialDelayMs, backoffFactor, and the resulting delay series
- Which errors are transient (retried) vs permanent (not retried)
- How per-item failures are isolated
- Open questions / TODOs — anything that requires a decision before coding starts

## Formatting Rules

- Tables for configs, collections, model names, tech stack — never prose lists for structured data.
- ASCII flow diagrams — not Mermaid. Annotate each step with `[filename]` and what it reads/writes.
- TypeScript code blocks for interfaces and retry configs.
- Numbered steps for function descriptions — not bullets.
- Links between docs — `overview.md` links to every other doc; each doc links back to `overview.md`.
- No marketing language — write like internal engineering docs.
- No redundancy — if a fact appears in `data-models.md`, do not repeat it in `usecase.md`. Link instead.

## What NOT to Include

- Implementation code (that is for the coding phase)
- Speculative features not in the diagram
- Explanations of why TypeScript or Firebase were chosen
- Anything that would rot immediately (no PR numbers, no "as discussed", no author names)

## Phase 5: Render to HTML

Once all checklist items below pass, invoke `SpecHtmlRenderer` to convert every `.md` file under this feature's `docs/` directory to styled HTML.

---

## Checklist
- [ ] Feature name and sub-feature diagrams obtained before writing any docs
- [ ] Codebase exploration completed (core utils, comparable feature, Firestore collections, Remote Config keys)
- [ ] All doc directories created before any files written
- [ ] Every doc file is under 100 lines
- [ ] Every function mentioned in `trigger.md` and `usecase.md` has a corresponding entry in a service doc
- [ ] Every Firestore collection in `data-models.md` appears in `firestore-service.md`
- [ ] Every external API call has a retry config block in its service doc
- [ ] `overview.md` links to every other doc in the sub-feature folder using relative links
- [ ] Open questions recorded in `tech-stack.md`
- [ ] Any sub-feature without a diagram has only an `overview.md` placeholder
- [ ] SpecHtmlRenderer invoked after all checklist items pass
