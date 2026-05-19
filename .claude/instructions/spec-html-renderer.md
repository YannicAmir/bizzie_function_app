# Spec HTML Renderer Rules

## Purpose

Produce a rich, single-page HTML spec document for each sub-feature that gives the developer **maximum implementation context**: annotated flow diagrams, TypeScript interfaces, service contracts, code excerpts, logging tables, setup steps, and any other visual element that helps a developer understand and implement the plan. This is a visualization tool, not a markdown-to-HTML converter.

Read `.claude/instructions/spec-html-style-guide.md` before writing a single line of HTML. Every styling, layout, and component decision is governed by that guide.

---

## Output: one HTML file per sub-feature

Do **not** produce one `.html` per `.md` file. Produce one `spec.html` per sub-feature folder:

```
src/features/{feature_name}/docs/{sub_feature}/spec.html
```

If a feature has multiple sub-features, produce one `spec.html` per sub-feature. Also produce a root `src/features/{feature_name}/spec.html` that links to each sub-feature spec.

The canonical example is `src/features/weekly_recap/spec.html`. Match its depth, structure, and component usage.

---

## Phase 1: Read all source docs

Glob and read every `.md` file under the target sub-feature's docs folder:

```
src/features/{feature_name}/docs/{sub_feature}/*.md
```

Read all files before writing any HTML. You need the full picture to:
- Build the sidebar nav with all sections
- Avoid repeating content across sections
- Know which components to use for which content

---

## Phase 2: Plan the sections

Map the docs to HTML sections using this standard mapping. Omit any section that has no real content.

| Source doc | HTML section(s) |
|---|---|
| `overview.md` | Overview, End-to-End Flow, File Structure |
| `trigger.md` | Entry Points (one `<h2>` per Cloud Function) |
| `usecase.md` | Orchestration — LangGraph (if applicable) + Node Table + Node Detail |
| `data-models.md` | Data — Input Types, Output Types, Firestore Schemas |
| `{service-name}.md` | Services — one section per service file |
| `tech-stack.md` | Infrastructure — Tech Stack, Retry Strategy, Env & Secrets, Token Budget (if present) |
| Logging entries in any doc | Logging — one `<h2>` per source file |
| Setup steps in `tech-stack.md` | Setup — one numbered section per setup task |

Group sidebar nav links under the standard section labels from the style guide.

---

## Phase 3: Write the HTML

Follow the full page structure from the style guide (CSS block, nav, main, JS block).

### Applying components

Use the style guide's component library to its full extent. Rules:

**`.flow` for every end-to-end flow and LangGraph graph**
- Translate the ASCII diagram from `overview.md` directly into a `.flow` div.
- For LangGraph flows, show each node with its file annotation and state writes, matching the pattern in `src/features/weekly_recap/spec.html#langgraph`.

**`.filetree` for file structure**
- Render the directory layout from the overview using `<span class="dir">`, `<span class="file">`, `<span class="cmt">`.

**`<pre><code>` for all TypeScript**
- Render every interface, type, annotation block, graph construction snippet, and retry config as a code block.
- For LangGraph features: always include the full `Annotation.Root` definition and the full graph construction block (`.addNode`, `.addEdge`, `.compile()`), matching the level of detail in the weekly_recap spec.

**`.callout` for design decisions**
- Use `.callout.amber` for any design decision that has a non-obvious "why" — e.g., `Promise.allSettled` vs `Promise.all`, fire-and-forget patterns, message acknowledgement behavior.
- Use `.callout` (blue) for utility/pattern notes — e.g., "model name resolved via Remote Config".
- Use `.callout.green` for confirmed/resolved open questions.

**`blockquote` for prerequisites and sequencing constraints**
- Use for any "do this after X" or "requires Y to exist first" instruction.

**`.badge` in logging tables**
- Every logging table cell for level uses a badge. Never write "info" or "warn" as plain text in a logging table.

**`.node` for named graph nodes inline in prose**
- Use when referencing a specific LangGraph node name in a paragraph.

**Tables for all structured data**
- Trigger config (type, schedule, memory, timeout)
- Retry strategy (maxAttempts, initialDelayMs, backoffFactor, delay series)
- Tech stack (layer | technology)
- Firestore collections (path | access | description)
- API functions (endpoint, params, return type)
- Token budget (input | limit | rationale)

### Sidebar nav

Build the nav from all sections you wrote. Use the section label conventions from the style guide. Every `<section id="...">` must have a corresponding `<a href="#...">` in the nav.

---

## Phase 4: Verify before saving

Before writing the file:

1. Every section referenced in the nav exists as a `<section id="...">` in `<main>`.
2. Every `<pre><code>` block contains real content from the spec docs — no fabricated code.
3. Every `.flow` diagram is verbatim from the spec docs — not paraphrased.
4. The CSS block is the full verbatim block from the style guide.
5. The JS scrollspy block is present at the end of `<body>`.
6. No external stylesheet or script dependencies — the file must be fully self-contained and openable directly in a browser.

---

## Rules

- Never modify `.md` files — read only.
- Never fabricate technical detail that is not in the spec docs.
- Never produce a shallow document. If a section has 2 lines of content, look at what the weekly_recap spec does with equivalent content and match that depth.
- If a sub-feature has only a placeholder `overview.md`, produce a `spec.html` that clearly marks it as a placeholder and shows only what is confirmed — no speculation.
- Open questions from `tech-stack.md` must appear as `.callout.amber` blocks in the Infrastructure section, not buried in prose.
