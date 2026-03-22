# Agent Builder Rules

## Output Paths
- Agent files → `.claude/agents/[name].md`
- Instruction files → `.claude/instructions/[name].md`
- Manual setup steps (human-facing only) → `.agent/info/[name]-info.md`

---

## Phase 1: Analysis & Strategy

1. **Input Analysis** — Read the user's request. Identify the core purpose and domain of the requested agent.

2. **Research** — If you do not know the exact steps to implement the requested feature, use WebSearch or read docs to understand the implementation before designing anything.

3. **Strategy Formulation** — Divide the work across the three file types:
    - **Workflow steps, detailed logic, constraints, naming conventions** → **Instruction file** (`.claude/instructions/[name].md`)
    - **Manual Setup** (portals, billing, API keys a human must create) → **Info file** (`.agent/info/[name]-info.md`)
    - **Agent identity** (who it is, what it does, which instructions to load) → **Agent file** (`.claude/agents/[name].md`)

4. **Naming** — Determine a `kebab-case` name (e.g., `genui-setup`, `stripe-payment`). Define a one-sentence description of what the agent does and when to invoke it.

---

## Phase 2: Generation (Order: Instructions → Info → Agent)

### Step 1 — Generate Instruction File (`.claude/instructions/[name].md`)

Create this FIRST. Put here:
- All workflow phases and numbered steps the agent must follow
- Constraints and rules the agent must obey
- Naming conventions specific to this agent
- Output file paths and templates
- Any decision logic or branching the agent must apply

No frontmatter. Plain markdown.

### Step 2 — Generate Info File (`.agent/info/[name]-info.md`)

**Condition:** ONLY create this file if there are strictly manual setup steps (console portals, billing, key generation) that an AI agent cannot perform. If no manual steps exist, skip this file entirely.

Content: detailed, step-by-step instructions written for the user to follow by hand.

### Step 3 — Generate Agent File (`.claude/agents/[name].md`)

The agent file must be **thin**. It contains only:

```markdown
---
name: kebab-case-name
description: One or two sentences — what it does AND when to invoke it.
tools: [optional — list only when restricting tools. Read-only agents: Read, Glob, Grep, Bash, WebSearch]
---

You are a [role description]. [One sentence on approach/personality if helpful.]

Read these instruction files before starting:
- `.claude/instructions/[name].md`
- `.claude/instructions/[other-relevant].md`
```

**Rules for the agent file:**
- No workflow steps in the agent file — those live in the instruction file
- No repeated content from CLAUDE.md or other instruction files
- Include only the instruction files this agent actually needs — do not load irrelevant ones
- The `tools` frontmatter field is optional; omit it to grant all tools, or list specific tools to restrict

---

## Phase 3: Confirmation

List all files created and their purpose. If the agent should also be user-invocable as a skill, suggest creating `.claude/skills/[name]/SKILL.md` pointing to the new agent.
