---
name: agent architecture
description: Architecture reference for how agents, instructions, and skills are structured in this repository.
---

# Agent Architecture Guide

> Architecture reference for how agents, instructions, and skills are structured in this repository. For step-by-step build procedures, see the co-located `build.agent.instructions.md`.

---

## 1. High-Level Overview

The system is organized around three core primitives:

```
┌─────────────────────────────────────────────────────┐
│                    ORGANIZATION                      │
│  (Departments → Agent Groups → Individual Agents)    │
│                                                      │
│   Agents READ Instructions (shared + local)          │
│   Agents EXECUTE Skills                              │
│   Manager Agents DELEGATE to Sub-Agents              │
└─────────────────────────────────────────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────┐       ┌─────────────────┐
│  INSTRUCTIONS   │       │     SKILLS      │
│  (the "how")    │       │  (the "what")   │
└─────────────────┘       └─────────────────┘
```

```
  Agents READ Instructions (shared + local)
  Agents EXECUTE Skills
  Manager Agents DELEGATE to Sub-Agents
```

---

## 2. Directory Tree

```
.github/
├── AGENTS.md
├── organization/
│   ├── operations/
│   │   ├── agent_builder/
│   │   │   └── agent.builder.agent.md              # Agent Builder Agent
│   │   └── shared_instructions/
│   │       ├── agent.architecture.instructions.md   # This file
│   │       └── build.agent.instructions.md          # Build procedures
│   └── technology/
│       ├── shared_instructions/
│       │   ├── architecture.guidance.instructions.md
│       │   ├── dart.best.practice.instructions.md
│       │   ├── flutter.best.practice.instructions.md
│       │   ├── restrictions.instructions.md
│       │   ├── software.dev.best.practice.instructions.md
│       │   ├── tech.stack.instructions.md
│       │   └── theme.styling.guidance.instructions.md
│       └── presentation_agents/
│           ├── presentation.management.instructions.md
│           ├── presentation.manager.agent.md
│           └── ui/
│               ├── ui_mananger/
│               │   ├── ui.manager.agent.md
│               │   └── ui.delegation.instructions.md
│               ├── ui_builder/
│               │   └── ui.builder.agent.md
│               ├── ui_corrector/
│               │   └── ui.corrector.agent.md
│               ├── ui_planner/
│               │   └── ui.planner.agent.md
│               └── ui_updater/
│                   └── ui.updater.agent.md
└── skills/
    ├── build-ui/SKILL.md
    ├── correct-ui/SKILL.md
    ├── execute-ui-management/SKILL.md
    ├── plan-ui/SKILL.md
    ├── review-ui/SKILL.md
    └── update-ui/SKILL.md
```

---

## 3. Naming Conventions

| Component   | Folder          | File                        | Example                          |
|-------------|-----------------|-----------------------------|----------------------------------|
| Agent       | `snake_case`    | `<name>.agent.md`           | `ui_builder/ui.builder.agent.md` |
| Instruction | (co-located)    | `<name>.instructions.md`    | `restrictions.instructions.md`   |
| Skill       | `kebab-case`    | `SKILL.md` (always)         | `build-ui/SKILL.md`             |

- File name segments are **dot-separated**: `dart.best.practice.instructions.md`
- Skill folders are always directly under `.github/skills/`
- Skill folder names are **verb-first**: `<verb>-<domain>/`

---

## 4. Hierarchy & Delegation Pattern

Agents follow a **manager → specialist** tree that mirrors an org chart.

```
organization/
└── <department>/
    ├── shared_instructions/
    └── <agent_group>/
        ├── <group>.management.instructions.md
        ├── <group>.manager.agent.md
        └── <sub_group>/
            ├── <sub_group>_mananger/
            │   ├── <name>.manager.agent.md
            │   └── <name>.delegation.instructions.md
            ├── <sub_group>_<specialist>/
            │   └── <name>.<role>.agent.md
            └── ...more specialists
```

### Current delegation chain

```
Presentation Manager
  └─→ UI Manager
        ├─→ UI Planner
        ├─→ UI Builder
        ├─→ UI Corrector
        └─→ UI Updater
```




