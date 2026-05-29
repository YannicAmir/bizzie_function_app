---
name: build agent instructions
description: Step-by-step procedure for building a new agent file.
---

# Build Agent Instructions

> Step-by-step procedure for building a new agent. For the agent file template/format, see `build.agent.template.instructions.md`. For architecture and naming conventions, see `agent.architecture.instructions.md`.

---

## CRITICAL: Never Wrap in Code Fences

Write the file content **directly** — do **NOT** wrap it in ` ```chatagent `, ` ```markdown `, or any other code fence. The file **must** start with `---` on line 1, with no preceding characters, fences, or blank lines.

Code fences cause the agent file to be treated as raw text instead of a parsed agent definition. Every agent file must begin exactly like this:

```
---
name: ...
description: ...
model: ...
tools: [...]
---
```

This rule applies every time, without exception. There is no case where a code fence is correct for a `.agent.md` file.

---

## 1. Determine Placement

1. Identify which **department** the agent belongs to (e.g., `technology`, `operations`).
2. Identify the **agent group** (e.g., `presentation_agents`).
3. Determine if the agent is a **manager** or a **specialist**.

---

## 2. Create the Agent Folder & File

1. Create the agent folder using `snake_case`: `organization/<dept>/<group>/<role>/`
2. Create the agent file: `<name>.<role>.agent.md` inside that folder.
3. Use the template from `build.agent.template.instructions.md` to structure the file.

**Example:**
```
organization/technology/presentation_agents/ui/ui_reviewer/
└── ui.reviewer.agent.md
```

---

## 3. Select the Model

Choose the model based on the agent's purpose. Only assign what is necessary:

| Model              | Use when the agent needs...                                              |
|--------------------|--------------------------------------------------------------------------|
| **Claude Opus 4.6**   | Complex reasoning, multi-step planning, architectural decisions, or cross-system coordination |
| **Claude Sonnet 4.6** | Standard development tasks — building, reviewing, correcting, updating code |
| **Claude Sonnet 4.5** | Simple, repetitive, or narrowly-scoped tasks with minimal reasoning      |

**Rules:**
- Default to **Claude Sonnet 4.6** unless the task clearly requires more or less capability.
- Use **Opus** only for agents that do planning, delegation, or cross-cutting architectural work.
- Use **Sonnet 4.5** only for agents with a single, simple, well-defined action.

---

## 4. Select the Tools

Only include tools that are **absolutely necessary** for the agent to complete its tasks according to its purpose. Do not add tools speculatively.

**Rules:**
- Review the agent's purpose and responsibilities to determine what actions it must perform.
- Each tool must map to a concrete action the agent needs to take.
- If the agent delegates to other agents, it needs the `agent` tool.
- If the agent executes code or commands, it needs the `execute` tool.
- Never include tools the agent will not use — fewer tools means a more focused agent.

---

## 5. Write the Personality

Define a clear, role-specific persona that reflects the agent's expertise:
- Be specific about the domain (e.g., "Flutter frontend development", "API design").
- Keep it to 1-3 bullet points.
- The personality should align with the agent's purpose from the frontmatter.

---

## 6. Set the Instructions Reference

List the absolute paths to all instruction files the agent must follow:
- Always include relevant **shared instructions** from the agent's department.
- Include any **group-level** or **agent-specific** instructions.
- Paths are relative to the repo root (e.g., `.github/organization/technology/shared_instructions/...`).

---

## 6a. No Redundancy Between Agent Files and Instruction Files

Delegation routing belongs **only** in the agent file's `# <SubAgentName>:` block. Instruction files must never repeat it.

**Rule:** Any delegation detail that appears in an agent file's `# <SubAgentName>:` block — including the sub-agent path, the trigger condition, and auto-delegation rules (e.g., "do not wait for user confirmation") — must **not** be duplicated in any instruction file.

- Instruction files may state **what data to pass** to a downstream agent (e.g., "pass the source package and the original query").
- Instruction files must **not** restate the sub-agent path, the when-to-delegate trigger, or the auto-delegation behavior — those are owned by the agent file.

---

## 7. Post-Build Registry Update

After building the agent, append a new entry to the **Agent Registry** in `.github/organization/operations/agent_availability_checker/agents.guidance.instructions.md` with the agent's name, path, and description.

---

## 8. Checklist

- [ ] Agent folder created (`snake_case`)
- [ ] Agent file created (`<name>.<role>.agent.md`)
- [ ] File starts with `---` on line 1 (no code fence wrappers)
- [ ] YAML frontmatter complete (`name`, `description`, `model`, `tools`)
- [ ] Model selected based on agent's purpose (not over- or under-provisioned)
- [ ] Tools are the minimum necessary set — no extras
- [ ] Personality defined with domain-specific expertise
- [ ] Instructions Reference lists all relevant instruction files
- [ ] No delegation details (sub-agent path, trigger condition, auto-delegate rules) duplicated between the agent file and any instruction file