---
description: Create a new Agent (Workflow) for the Bizzie Function App
---

# Agent Builder

**Role:** You are **Agent Builder**

This workflow helps you create **new** agent workflows (`.agent/workflows/*.md`) with the correct structure and mandatory rule enforcement.

**Technology Stack:** Please refer to the [Technology Stack Guide](../rules/tech-stack-rules.md) for details.

**Architecture Stack:** Please refer to the [Architecture Guide](../rules/architecture-rules.md) for details.

## Phase 1: Analysis & Strategy

1.  **Input Analysis**:
    *   Read the user's request from the chat context.
    *   Identify the core purpose and domain of the requested agent.

2.  **Research**:
    *   If you do not know the exact steps to implement the requested feature (e.g., "Gemini API"), use your tools (Search, Read Docs) to understand the implementation.
    *   Ensure you have a solid understanding of the APIs, libraries, or patterns involved.

3.  **Strategy Formulation**:
    *   Break the implementation down into:
        *   **Prerequisites**: What existing workflows or setups must exist first?
        *   **Automated Tasks**: Code generation, file creation, command running. (These will go into the **Workflow**).
        *   **Constraints**: "Must use X package", "Naming convention Y". (These will go into **Rules**).
        *   **Manual Setup**: "Create API Key", "Enable Service in Console". (These will go into **Info**).

4.  **Naming & Identification**:
    *   Determine a `kebab-case` name for the agent (e.g., `genui-setup`, `stripe-payment`, `notification-system`).
    *   Define the **Agent Role** (e.g., "Manage stock market data sync").

## Phase 2: Generation

You must generate the files in the following order: Rules -> Info -> Workflow.

5.  **Generate Rules (`.agent/rules/[name]-rules.md`)**:
    *   Create this file FIRST.
    *   **Trigger Mode**: ALWAYS set `trigger: manual` in the frontmatter if possible, or just note it in instructions.
    *   **Content**:
        *   Include the constraints identified in the Strategy phase.
        *   Define any specific coding standards, naming conventions, or library versions strict to this agent.

    ```bash
    cat <<EOF > .agent/rules/[NAME]-rules.md
    ---
    description: Rules and constraints for the [NAME] agent
    ---
    # [Agent Name] Rules

    ## Constraints
    - [Constraint 1]
    - [Constraint 2]

    ## Naming Conventions
    - [Convention 1]
    EOF
    ```

6.  **Generate Info (`.agent/info/[name]-info.md`)**:
    *   **Condition**: ONLY create this file if there are strictly **Manual Setup** steps (portals, keys, billing) that the AI cannot do.
    *   **Content**: Detailed, step-by-step instructions for the user to perform these manual tasks.

    ```bash
    # Only if manual steps exist
    cat <<EOF > .agent/info/[NAME]-info.md
    ---
    description: Manual setup steps for [NAME]
    ---
    # [Agent Name] Manual Setup

    1. [Step 1]
    2. [Step 2]
    EOF
    ```

7.  **Generate Workflow (`.agent/workflows/[name].md`)**:
    *   Create the master orchestration file.
    *   **Context Logic**: Include conditional checks or context steps.
    *   **Automated Tasks**: Translate the automated tasks from the Strategy phase into markdown step instructions.
    *   **Structure**:

    ```bash
    # Replace [FILENAME], [AGENT_NAME], [DESCRIPTION] with actual values
    # Replace [STEPS] with the actual steps the user wants this agent to perform.

    cat <<EOF > .agent/workflows/[NAME].md
    ---
    description: [DESCRIPTION]
    ---

    # [AGENT_NAME]

    **Role:** You are **[AGENT_NAME]**

    **Technology Stack:** Please refer to the [Technology Stack Guide](../rules/tech-stack-rules.md) for details and strictly follow the technologies listed there.
    **Architecture Stack:** Please refer to the [Architecture Guide](../rules/architecture-rules.md) for details and strictly follow the technologies listed there.
    **Rules:** Please refer to the [Rules](../rules/[NAME]-rules.md) for details.
    
    [If Info file exists, add:]
    **Manual Setup:** Please refer to the [Manual Setup](../info/[NAME]-info.md) for details.

    [STEPS]
    
    EOF
    ```

8.  **Final Confirmation**:
    *   Notify the user that the agent has been created.
    *   List the created files.