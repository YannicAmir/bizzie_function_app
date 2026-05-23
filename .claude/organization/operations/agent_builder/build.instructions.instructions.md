---
name: build instructions instructions
description: Step-by-step procedure for building a new instruction file.
---

# Build Instructions Instructions

> Step-by-step procedure for building a new instruction file. For the raw template, see `build.instructions.template.instructions.md`. For architecture and naming conventions, see `agent.architecture.instructions.md`.

---

## CRITICAL: Never Wrap in Code Fences

Write the file content **directly** — do **NOT** wrap it in ` ```instructions `, ` ```markdown `, or any other code fence. The file **must** start with `---` on line 1, with no preceding characters, fences, or blank lines.

Code fences cause the file to be treated as raw text instead of parsed instructions. Every instruction file must begin exactly like this:

```
---
name: ...
description: ...
---
```

This rule applies every time, without exception. There is no case where a code fence is correct for a `.instructions.md` file.

---

## 1. Determine the Instruction Type

Instruction files serve different purposes depending on the agent they support:

| Type                  | Used by             | Contains                                                    |
|-----------------------|---------------------|-------------------------------------------------------------|
| **Delegation**        | Manager agents      | Rules for routing tasks to sub-agents                       |
| **Management**        | Group managers      | Broader responsibilities and coordination guidance          |
| **Specialist**        | Specialist agents   | Step-by-step procedures for executing a specific task       |
| **Shared / Best Practice** | Multiple agents | Cross-cutting guidance (e.g., coding standards, architecture) |

---

## 2. Determine Placement & Scope

Place the file according to who needs to read it (see architecture guide Section 5):

- **Department-wide** → `organization/<dept>/shared_instructions/`
- **Group-level** → co-located at the agent group root
- **Agent-specific** → inside the agent's folder

---

## 3. Name the File

- Use `dot.separated.segments.instructions.md` format.
- The name should clearly describe the instruction's purpose.
- For delegation instructions: `<name>.delegation.instructions.md`
- For management instructions: `<name>.management.instructions.md`
- For general instructions: `<descriptive.name>.instructions.md`

---

## 4. Write the Frontmatter

### Name
- Human-readable name for the instruction set.

### Description
- Clearly state what this instruction file describes and its purpose.
- Be specific about which agent(s) or skill(s) it supports.

---

## 5. Add Reference Docs (if applicable)

Use the `# Reference Doc:` section to link to:
- External documentation or websites the agent should consult.
- Other internal instruction files the agent should cross-reference.
- API docs, design specs, or standards the instructions are based on.

If there are no external references, omit this section.

---

## 6. Write the Instructions Body

### For manager / delegator agents:

The body must list each sub-agent the manager can delegate to. Each sub-agent gets its own `#` heading with:
- The path to the sub-agent's `.agent.md` file.
- A description of **when** the manager delegates to this sub-agent and **what** it is responsible for.

Follow this pattern for each sub-agent:
```markdown
# <Sub-Agent Name>:
- <path to .agent.md>
- <When/why the manager delegates here. What this sub-agent does.>
```

**Optional `# Sequence:` section:** If the manager should automatically trigger agents in a specific order (agent flow), add a `# Sequence:` section with numbered steps describing the execution order. This is useful when one sub-agent's output feeds into another's input.

### For specialist agents:
- Write clear, numbered steps the agent must follow.
- Be specific about inputs, outputs, and expected behavior.
- Include any constraints or edge cases.
- Use `# Reference Doc:` to link to external URLs or internal docs the agent should consult.

### For shared / best practice instructions:
- Document standards, patterns, and conventions.
- Provide examples of correct and incorrect usage.
- Keep guidance actionable — agents should be able to follow it directly.

---

## 7. Add a Checklist Section

Every instructions file **must** end with a `## Checklist` section. This is a required section — do not omit it.

- The checklist items must be specific to the instruction file's scope and purpose.
- Each item should be a concrete, verifiable condition that confirms the agent has correctly followed the instructions.
- Use `- [ ]` checkbox format for all items.
- Tailor the items to the instruction type:
  - **Delegation instructions:** confirm each sub-agent path is correct, triggers are defined, and no logic is duplicated between the agent file and instruction file.
  - **Specialist instructions:** confirm each step is followed, inputs/outputs are handled, constraints are respected, and scope has not been exceeded.
  - **Shared / best practice instructions:** confirm standards are applied, no exceptions were made, and patterns are consistent with the rest of the codebase.

---

## 8. Checklist

- [ ] Instruction type identified (delegation, management, specialist, shared)
- [ ] File placed at correct scope (department, group, or agent-specific)
- [ ] Named with `.instructions.md` suffix and dot-separated segments
- [ ] File starts with `---` on line 1 (no code fence wrappers)
- [ ] Frontmatter complete (`name`, `description`)
- [ ] Reference docs included (if applicable)
- [ ] Instructions body is clear, specific, and actionable
- [ ] `## Checklist` section included at the end with items specific to this instruction's scope
- [ ] Referenced from the relevant agent's `# Instructions Reference` section
