---
name: Migration Best Practices
description: Guidelines for ensuring legacy skill migration remains accurate and modular.
---

# Migration Best Practices

- **STRICT RULE: NEVER DELETE:** You are strictly forbidden from deleting or modifying any existing files or folders in `.claude/` or `.agent/`. Migration and duplication mean **adding** to `.agent/skills/` while keeping the original files exactly as they are.
- **Always Verify Target:** Before migrating, ensure you have correctly identified the legacy rule, workflow, or skill structure.
- **Reference Over Copy:** When migrating instructions, check if they can be moved to `.agent/shared_instructions/` first to reduce duplication across skills.
- **Maintain Logic: Keep Original Intact:** Ensure the logic is preserved in the new structure, but do not change the source files in any way.
