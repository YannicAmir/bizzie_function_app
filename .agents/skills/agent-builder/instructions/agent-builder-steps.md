---
name: Agent Builder Steps
description: Step-by-step scaffolding process for creating production-ready Antigravity skills.
---

# Agent Builder — Step-by-Step Scaffolding Process

Follow these phases precisely every time a user asks you to create a new skill.

---

## Phase 1: Understand the Request

1. **Read the user's request carefully.**
   - What is the skill's purpose? (e.g., "scaffold a new feature", "run a database migration", "generate a test suite")
   - What domain does it operate in? (e.g., TypeScript backend, LangGraph agent, Firebase config)

2. **Derive the skill name.**
   - Use `kebab-case` (e.g., `feature-builder`, `test-engineer`, `db-migrator`).
   - The name will become the directory name and is used in all file paths.

3. **Identify instructions scope.**
   - Determine what guidance the agent needs to do its job.
   - Ask: is any instruction potentially shared across multiple skills? If yes, it belongs in `.agent/shared_instructions/`. Otherwise, place it in `.agent/skills/[skill-name]/instructions/`.

---

## Phase 2: Plan the File Set

Before writing any files, produce a short plan listing:

```
Skill name:   [skill-name]
SKILL.md:     .agent/skills/[skill-name]/SKILL.md
Agent file:   .agent/skills/[skill-name]/agents/[skill-name].md
Instructions:
  - .agent/skills/[skill-name]/instructions/[topic].md     (skill-specific)
  - .agent/shared_instructions/[topic].md                  (shared, if applicable)
```

---

## Phase 3: Create the Files (in order)

### Step 1 — Create `SKILL.md`

Path: `.agent/skills/[skill-name]/SKILL.md`

```markdown
---
name: [skill-name]
description: One-line description of what the skill does.
---

Call [.agent/skills/[skill-name]/agents/[skill-name].md](.agent/skills/[skill-name]/agents/[skill-name].md)
```

Rules:
- Frontmatter must have exactly two keys: `name` and `description`.
- The body must be exactly one line: `Call [path](path)` — both the link text and href use the same relative path from the project root.
- No extra content.

---

### Step 2 — Create the Agent File

Path: `.agent/skills/[skill-name]/agents/[skill-name].md`

```markdown
---
name: [Human Readable Agent Name]
description: [One sentence describing the agent's scope.]
---

You are a **Senior [Domain/Role] Engineer** responsible for [core responsibility in one sentence].
[Optional: one more sentence about tone, output style, or constraints.]

---

## Instructions

Follow the [instruction topic] steps defined in:
[[Instruction Title]]([relative-path-to-instruction-file.md])

[Repeat for each instruction file, one link per file.]
```

Rules:
- Personality block must start with `You are a **…**`.
- The `## Instructions` section must list every instruction file the agent references.
- Use paths relative to the project root for all links.
- Do **not** include business logic or step-by-step instructions in this file — those belong in instruction files.

---

### Step 3 — Create Instruction Files

For each instruction document identified in Phase 2:

**Skill-specific instruction** — Path: `.agent/skills/[skill-name]/instructions/[topic].md`

**Shared instruction** — Path: `.agent/shared_instructions/[topic].md`

Rules:
- **Must contain YAML frontmatter** with `name` and `description` fields.
- Each file covers exactly **one responsibility**.
- Write instructions so the agent can follow them top-to-bottom without ambiguity.
- Use numbered steps, code blocks, and concrete examples.
- **Must include a "Verification Checklist" section at the end** (using `## Verification Checklist`) for task-oriented or step-by-step files only, to be verified against as the last step.

```markdown
---
name: [Instruction Name]
description: [One sentence describing the responsibility of this document.]
---

# [Instruction Name]
...

---

## Verification Checklist

- [ ] [Verification point 1]
- [ ] [Verification point 2]
```

---

## Phase 4: Validate

After creating all files, verify the following checklist:

- [ ] Files created successfully at the correct paths.
- [ ] `SKILL.md` follows the 1-line body contract.
- [ ] Agent file references all created instruction files.
- [ ] Instruction files contain frontmatter and checklists.
- [ ] All paths are project-root-relative.


---

## Phase 5: Confirm to User

Report the following after a successful scaffold:

```
✅ Skill "[skill-name]" created successfully.

Files created:
- .agent/skills/[skill-name]/SKILL.md
- .agent/skills/[skill-name]/agents/[skill-name].md
- .agent/skills/[skill-name]/instructions/[topic].md
[- .agent/shared_instructions/[topic].md  (if shared)]
```
