---
name: Skill Contract & Structure
description: The canonical architecture, file contracts, and core best practices for all Antigravity skills.
---

# Skill Contract & Structure

Every skill created or updated in this repository **MUST** conform to this canonical structure.

## Directory Layout

```text
.agent/skills/[skill-name]/
├── SKILL.md                  # Entry point (required)
├── agents/
│   └── [skill-name].md       # Agent profile (required)
└── instructions/
    └── [instruction-name].md  # Skill-specific instructions (optional)
```

---

## File Contracts

### `SKILL.md` (required)

Must contain:
1. **YAML frontmatter** with `name` and `description` fields.
2. A single line — `Call [path/to/agents/skill-name.md](path/to/agents/skill-name.md)` — using a relative path from the project root.

**Description format:**
- The `description` field must follow this pattern: **when** the skill is triggered + **what** it does.
- Keep it to one concise sentence.
- **DO NOT** wrap the description in quotation marks.

> ✅ `description: Triggered when a user wants to scaffold a new feature. Creates the trigger, usecase, and service files following Clean Architecture.`
> ❌ `description: "Triggered when a user wants to scaffold a new feature."`

```markdown
---
name: my-skill
description: Triggered when [condition]. [What it does in one sentence].
---

Call [.agent/skills/my-skill/agents/my-skill.md](.agent/skills/my-skill/agents/my-skill.md)
```

---

### `agents/[skill-name].md` (required)

Must contain:
1. **YAML frontmatter** with `name` and `description` fields.
2. A **personality block** — one clear paragraph beginning with "You are a …" that states the engineer role and responsibility.
3. An **Instructions section** — markdown links to every instruction file the agent must follow, using paths relative to the project root.

**STRICT RULE:** The agent file **MUST NOT** contain any direct instructions, best practices, rules, logic, or code. It serves purely as a "profile" that references external instruction files. Any guidance for the agent must be moved to a focused markdown file in the `instructions/` directory.

---

### Instruction Files (`instructions/*.md`)

Must contain:
1. **YAML frontmatter** with `name` and `description` fields.
2. A **Verification Checklist** section at the end (for task-oriented or step-by-step files only).

**Best Practices:**
- **Keep instruction files ≤ 200 lines.** If a file is approaching this limit, split it.
- **Use project-root-relative paths** for all links and references.
- **Single Responsibility:** Each file must focus on one concern (e.g., steps, rules, context).
