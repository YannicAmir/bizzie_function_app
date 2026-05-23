---
name: legacy migration instructions
description: Step-by-step procedure for the LegacyMigrator agent to migrate .c-old/ agent definitions and instruction files into the new .claude/organization/... multi-agent architecture.
---

# Instructions for LegacyMigrator

## Overview

Read every file in `.c-old/agents/` and `.c-old/instructions/`, then produce equivalent artifacts in the new `.claude/organization/...` structure. Work through the numbered steps below in order. Never skip a step. Always verify the current state before writing anything.

---

## Step 1 — Inventory old agents

1. List all files in `.c-old/agents/`.
2. For each file, read it and record:
   - `name` — the filename without extension, used as the agent identifier.
   - `description` — from the YAML frontmatter `description` field.
   - `tools` — from the YAML frontmatter `tools` field.
   - `personality / purpose` — the body text below the closing `---` of the frontmatter.
   - `referenced instruction files` — every `.c-old/instructions/*.md` filename cited inside the body.
3. Store this inventory in memory for use in subsequent steps.

---

## Step 2 — Inventory old instruction files

1. List all files in `.c-old/instructions/`.
2. Read each file so its full content is available when writing the new instruction files.
3. Note which agent(s) reference each instruction file.

---

## Step 3 — Check the Agent Registry for duplicates

1. Read `.claude/organization/operations/agent_availability_checker/agents.guidance.instructions.md`.
2. For each old agent from the Step 1 inventory, check whether an equivalent agent already exists in the registry by name or purpose.
3. Mark any agent that already has a direct equivalent as **"already migrated"** and exclude it from all subsequent steps.
4. Log the skipped agents so they can be reported in the final summary (Step 8).

---

## Step 4 — Classify each unmigrated agent

Determine the new `department`, `group`, and `role` for each agent using the mapping below. For any agent not in the list, infer the correct placement from its description and body content.

| Old agent name              | New placement (dept / group / role)                              |
|-----------------------------|------------------------------------------------------------------|
| `feature-builder`           | `technology / cloud_function_agents / feature_builder`           |
| `langgraph-feature-builder` | `technology / langgraph_agents / langgraph_feature_builder`      |
| `langgraph-cost-estimator`  | `technology / langgraph_agents / langgraph_cost_estimator`       |
| `langgraph-execution-flow`  | `technology / langgraph_agents / langgraph_execution_flow`       |
| `langgraph-transformer-flow`| `technology / langgraph_agents / langgraph_transformer_flow`     |
| `langgraph-inspector`       | `technology / langgraph_agents / langgraph_inspector`            |
| `langgraph-python-setup`    | `technology / langgraph_agents / langgraph_python_setup`         |
| `spec-orchestrator`         | `operations / spec_agents / spec_orchestrator` (manager)         |
| `spec-writer`               | `operations / spec_agents / spec_writer`                         |
| `spec-updater`              | `operations / spec_agents / spec_updater`                        |
| `spec-validator`            | `operations / spec_agents / spec_validator`                      |
| `spec-html-renderer`        | `operations / spec_agents / spec_html_renderer`                  |
| `spec-html-updater`         | `operations / spec_agents / spec_html_updater`                   |
| `logging-agent`             | `technology / cloud_function_agents / logging_agent`             |
| `cicd-deploy`               | `operations / cicd_agents / cicd_deploy`                         |
| `function-runner`           | `technology / cloud_function_agents / function_runner`           |
| `project-consultant`        | `operations / consulting_agents / project_consultant`            |
| `setup-project`             | `operations / setup_agents / setup_project`                      |

Select the model based on the agent's role:
- Manager or orchestrator agents → `Claude Opus 4.6`
- Standard builder / updater / corrector / specialist agents → `Claude Sonnet 4.6`
- Simple single-action agents → `Claude Sonnet 4.5`

---

## Step 5 — Create the agent folder and agent file for each unmigrated agent

For each agent being migrated:

1. Determine the folder path: `.claude/organization/<dept>/<group>/<role>/`
2. Create the folder if it does not already exist.
3. Determine the agent filename using the role segment in kebab form: `<kebab-role>.agent.md`
   - Example: role `feature_builder` → file `feature.builder.agent.md`
4. Write the agent file using this exact format (file starts with `---` on line 1, no code fences):

```
---
name: <PascalCaseName>
description: <One-sentence description derived from the old agent description field>
model: <selected model>
tools: [execute]
---
# Personality
- <Role-specific persona derived from the old agent body>

# Instructions Reference:
- .claude/organization/<dept>/<group>/<role>/<name>.instructions.md
```

5. Verify the file was written and starts with `---` on line 1.

---

## Step 6 — Create the instruction file for each unmigrated agent

For each agent being migrated:

1. Determine the instruction filename: `<kebab-name>.instructions.md`
   - Example: `feature.builder.instructions.md`
2. Write the instruction file to the same folder as the agent file.
3. The file must start with `---` on line 1. Use this structure:

```
---
name: <human-readable name>
description: <What this instruction file describes and its purpose.>
---

# Instructions for <AgentName>

<Numbered steps extracted and rewritten from:>
  (a) the body of the old .c-old/agents/<name>.md file
  (b) every .c-old/instructions/*.md file the old agent referenced

<Structure the content as clear, numbered workflow steps with constraints, edge cases, and expected outputs.>
<If the old agent referenced instruction files that no longer exist under .claude/instructions/, use the .c-old/instructions/ equivalents.>

---

## Checklist
- [ ] <Verifiable condition confirming a key step was followed>
- [ ] <Each referenced old instruction file has been incorporated>
- [ ] <Constraints and edge cases from the old agent body are preserved>
- [ ] <Scope not exceeded — only content from the old agent and its referenced instructions>
```

4. Verify the file was written and starts with `---` on line 1.

---

## Step 7 — Update the Agent Registry

After all agents have been migrated:

1. Open `.claude/organization/operations/agent_availability_checker/agents.guidance.instructions.md`.
2. Append one new entry per migrated agent at the end of the `# Agent Registry` section, using this format:

```
## <AgentName>
- **Path:** `.claude/organization/<dept>/<group>/<role>/<kebab-role>.agent.md`
- **Description:** <one-sentence description>
```

3. Save the file and verify the new entries are present.

---

## Step 8 — Report to the user

Output a Markdown summary table with the following columns:

| Agent Name | Old Path | New Agent File | Status |
|------------|----------|----------------|--------|

- **Status** values: `migrated` or `skipped — already exists`
- Include every agent from the original `.c-old/agents/` inventory.
- List skipped agents with their registry equivalent noted in parentheses after the status.

---

## Constraints

- Never duplicate content between the agent file and the instruction file. Delegation routing belongs only in the agent file's `# <SubAgentName>:` block.
- Never wrap file content in code fences when writing `.agent.md` or `.instructions.md` files.
- Never modify files outside `.claude/organization/...` and `.c-old/`.
- If a `.c-old/instructions/` file referenced by an old agent no longer exists under `.claude/instructions/`, use the `.c-old/instructions/` copy as the source of truth.
- Do not create a new agent file if a direct equivalent already appears in the Agent Registry (checked in Step 3).

---

## Checklist

- [ ] All files in `.c-old/agents/` have been inventoried (Step 1 complete)
- [ ] All files in `.c-old/instructions/` have been read and are available (Step 2 complete)
- [ ] Agent Registry checked and duplicate agents identified and excluded (Step 3 complete)
- [ ] Every unmigrated agent has been classified with a dept / group / role (Step 4 complete)
- [ ] Agent file created for each unmigrated agent — starts with `---` on line 1, no code fences (Step 5 complete)
- [ ] Instruction file created for each unmigrated agent — starts with `---` on line 1, no code fences (Step 6 complete)
- [ ] Agent Registry updated with one entry per migrated agent (Step 7 complete)
- [ ] Summary table reported to user covering all agents (Step 8 complete)
- [ ] No content duplicated between agent files and instruction files
- [ ] No files written outside `.claude/organization/...` and `.c-old/`
