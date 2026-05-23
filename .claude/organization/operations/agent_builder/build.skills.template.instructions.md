---
name: skill template
description: Raw template for SKILL.md files.
---

# Skill Template

> Raw template for `SKILL.md` files. For instructions on how to fill this out, see `.github/organization/operations/shared_instructions/build.skills.instructions.md`.

> **IMPORTANT:** When creating `SKILL.md` files, write the content **directly** — do NOT wrap it in code fences (e.g., `` ```skill ```` or `` ```markdown ``). The file must start with the `---` YAML frontmatter delimiter on line 1. Code fences are shown below only for illustration purposes within this template document.

---

## Template

```markdown
---
name: <skill-name>
description: <Trigger condition — when this skill activates>
---

# Agent Name: <agent-name>
Call <path to the agent's .agent.md file>
```

---

## Example

```markdown
---
name: manage-test-skills
description: Trigger when user asks to learn about stock market sectors
---

# Agent Name: manager-agent
Call .github/organization/technology/Test/agents/manager-agent/Manager.agent.md
```
