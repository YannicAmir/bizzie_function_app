---
name: Migration Steps
description: Detailed process for translating and migrating legacy rules, workflows, and Claude skills into the modular .agent/skills/ architecture.
---

# Migration Steps

Follow these phases whenever a user asks to migrate or update a legacy rule, workflow, or skill.

---

## Phase 1: Understand the Migration Target

1.  Identify the target:
    -   `.agent/rules/*.md` (Rule file)
    -   `.agent/workflows/*.md` (Workflow file)
    -   `.claude/skills/[name]/` (Legacy Claude Skill)
2.  Determine the target skill name (usually the filename without extension, or the directory name).

---

## Phase 2: Implementation (New Skill Creation)

### For Rule Migration (`.agent/rules/*.md`)
1.  Create `.agent/skills/[name]/SKILL.md` with "Triggered when..." description.
2.  Create `.agent/skills/[name]/agents/[name].md` with personality and references.
3.  Create `.agent/skills/[name]/instructions/rules.md`.
    -   Copy rule content into this file.
    -   **MUST** include YAML frontmatter.

### For Workflow Migration (`.agent/workflows/*.md`)
1.  Create `.agent/skills/[name]/SKILL.md` with "Triggered when..." description.
2.  Create `.agent/skills/[name]/agents/[name].md` with personality and references.
3.  Create `.agent/skills/[name]/instructions/steps.md`.
    -   Copy workflow steps into this file.
    -   **MUST** include YAML frontmatter.
    -   **MUST** include a `## Verification Checklist` at the end for task self-validation.

### For Legacy Claude Skill Migration (`.claude/skills/[name]/`)
1.  Map `.claude/skills/[name]/SKILL.md` to new `.agent/skills/[name]/SKILL.md`.
2.  Map `.claude/agents/[name].md` to new `.agent/skills/[name]/agents/[name].md`.
    -   Rename file if necessary.
3.  Identify instructions referenced in the legacy agent.
    -   Create corresponding new instruction files in `.agent/skills/[name]/instructions/`.
    -   **MUST** include YAML frontmatter and (for task-oriented files) checklists.

---

## Phase 3: Validation

- [ ] All files created at correct paths in `.agent/skills/[name]/`.
- [ ] Every new file has valid YAML frontmatter (where required).
- [ ] Task-oriented instruction files have a `## Verification Checklist`.
- [ ] **Original files in `.claude/` and `.agent/` are NOT deleted or modified.**
- [ ] Every path in the generated files is relative to the project root.

---

## Verification Checklist

- [ ] Files created successfully without modifying or deleting ANY originals.
- [ ] Both `.agent/` and `.claude/` versions coexist peacefully.
- [ ] All instruction files have frontmatter.
- [ ] Task instruction files have verification checklists.
- [ ] All paths are project-root-relative.
