---
name: build skills instructions
description: Step-by-step procedure for building a new skill.
---

# Build Skills Instructions

> Step-by-step procedure for building a new skill. For the SKILL.md template/format, see `build.skills.template.instructions.md`. For architecture and naming conventions, see `agent.architecture.instructions.md`.

---

## 1. Determine the Skill

1. Identify the **action** the skill represents — skills are verb-first (e.g., `build`, `review`, `correct`, `plan`).
2. Identify the **domain** the action applies to (e.g., `ui`, `api`, `data`).
3. Combine into a `kebab-case` name: `<verb>-<domain>` (e.g., `build-ui`, `review-api`).

---

## 2. Create the Skill Folder & File

1. Create the skill folder in `.github/skills/` using the `kebab-case` name: `.github/skills/<verb>-<domain>/`
2. Create a `SKILL.md` file inside that folder (always this exact filename).
3. Use the template from `build.skills.template.instructions.md` to structure the file.

**Example:**
```
.github/skills/test-ui/
└── SKILL.md
```

---

## 3. Write the Frontmatter

### Name
- Must match the folder name exactly (e.g., folder `build-ui/` → name `build-ui`).

### Description
- Describes the **user intent** that triggers this skill — not what the skill does internally.
- Write it as a trigger condition: "Trigger when user asks to..." or "When the user requests..."
- Be specific enough that the skill activates for the right requests and not for unrelated ones.

**Good examples:**
- `Trigger when user asks to build a new UI screen or component`
- `Trigger when user asks to correct or fix UI bugs`
- `Trigger when user asks to review existing UI code`

**Bad examples:**
- `Builds UI` (too vague, not a trigger condition)
- `This skill handles everything related to UI` (too broad)

---

## 4. Assign the Executing Agent

1. Identify which agent is responsible for performing this skill's action.
2. Every skill **must** have exactly one agent assigned to execute it.
3. The agent must already exist, or be created alongside the skill (see `.github/organization/operations/shared_instructions/build.agent.instructions.md`).
4. The skill's name should align with the agent's role by naming convention (e.g., `build-ui` → `ui_builder`).

**In the body:**
- Use `# Agent Name: <agent-name>` as the header.
- On the next line, prefix with `Call` followed by the full path to the agent's `.agent.md` file from the repo root (e.g., `Call .github/organization/.../agent.md`).

---

## 5. Skill Placement Rules

- All skills live **directly** under `.github/skills/` — no nesting.
- One folder per skill, one `SKILL.md` per folder.
- Never place skills inside `organization/` — skills are always in `.github/skills/`.

---

## 6. Checklist

- [ ] Skill name is `kebab-case` and verb-first (`<verb>-<domain>`)
- [ ] Folder created at `.github/skills/<skill-name>/`
- [ ] `SKILL.md` created inside the folder
- [ ] Frontmatter `name` matches folder name exactly
- [ ] Frontmatter `description` is a clear trigger condition
- [ ] Executing agent identified and path is correct
- [ ] Agent exists (or is being created alongside this skill)
- [ ] Skill name aligns with agent role by convention
