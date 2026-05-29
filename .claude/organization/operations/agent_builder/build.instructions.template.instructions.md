---
name: instructions template
description: Raw template for .instructions.md files.
---

# Instructions Template

> Raw template for `.instructions.md` files. For instructions on how to fill this out, see `build.instructions.instructions.md`.

> **IMPORTANT:** When creating `.instructions.md` files, write the content **directly** — do NOT wrap it in code fences (e.g., `` ````instructions ```` or `` ```markdown ``). The file must start with the `---` YAML frontmatter delimiter on line 1. Code fences are shown below only for illustration purposes within this template document.

---

## Template: Manager / Delegator Agent Instructions

```markdown
---
name: <instruction name>
description: <What this instruction file describes and its purpose.>
---

# <Sub-Agent Name>:
- <path to the sub-agent's .agent.md file>
- <When and why the manager delegates to this sub-agent. What this sub-agent is responsible for.>

# <Sub-Agent Name>:
- <path to the sub-agent's .agent.md file>
- <When and why the manager delegates to this sub-agent. What this sub-agent is responsible for.>

# Sequence (optional):
1. <Step describing automatic agent flow / execution order>
2. <Next step in the sequence>

---

## Checklist
- [ ] <Verifiable condition confirming correct delegation or routing behavior>
- [ ] <Each sub-agent path confirmed correct>
- [ ] <Delegation triggers clearly defined>
- [ ] <No delegation details duplicated from agent file>
```

---

## Template: Specialist Agent Instructions

```markdown
---
name: <instruction name>
description: <What this instruction file describes and its purpose.>
---

# Reference Doc:
<links to external documentation, websites, or resources (if applicable)>

# Instructions for <skill-or-agent-name>
<numbered steps the agent must follow>

---

## Checklist
- [ ] <Verifiable condition confirming each required step was followed>
- [ ] <Inputs and outputs handled correctly>
- [ ] <Constraints and edge cases respected>
- [ ] <Scope not exceeded>
```

---

## Example: Manager / Delegator Agent Instructions

```markdown
---
name: manager instructions
description: This instruction file describes how the manager agent delegates tasks to sub-agents and coordinates their execution.
---

# Plan Agent:
- .github/organization/technology/Test/agents/plan-test-agent/Plan.Test.agent.md
- For planning tasks, the manager agent will delegate to the Plan Agent. The Plan Agent is responsible for creating a plan to tell the user about the relevant topic.

# Build Agent:
- .github/organization/technology/Test/agents/build-test-agent/Build.Test.agent.md
- For execution tasks, the manager agent will delegate to the Build Agent. The Build Agent is responsible for implementing the plan created by the Plan Agent.

# Sequence:
1. When the user asks to learn about a topic, first delegate to the Plan Agent to create a plan.
2. Once the Plan Agent returns the plan, delegate to the Build Agent to execute the plan.
```

---

## Example: Specialist Agent Instructions (with external reference)

```markdown
---
name: test instructions
description: This instruction file describes the expected format for the SKILL.md files in the test skills directory.
---

# Reference Doc:
https://www.fool.com/investing/stock-market/market-sectors/

# Instructions for test-skill
1. Say: "Here is your plan from the Build Agent!" and then execute the plan provided by the Plan Agent.
2. Create a new .md file and write the information from the plan into the file. The file should be named "plan.md" and should be saved on the same level as .github/.
3. After executing the plan, say: "See you next session!"
```
