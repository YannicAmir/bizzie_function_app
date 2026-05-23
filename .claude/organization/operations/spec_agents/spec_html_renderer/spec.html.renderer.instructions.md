---
name: Spec HTML Renderer Instructions
description: Full workflow, component library reference, CSS/JS templates, section mapping, and quality rules for producing rich self-contained HTML spec documents from markdown source files.
---

# Instructions for SpecHtmlRenderer

## Purpose

Produce a rich, single-page HTML spec document for each sub-feature that gives the developer maximum implementation context: annotated flow diagrams, TypeScript interfaces, service contracts, code excerpts, logging tables, setup steps, and any other visual element that helps a developer understand and implement the plan. This is a visualization tool, not a markdown-to-HTML converter.

## Output: One HTML File Per Sub-Feature

Do not produce one `.html` per `.md` file. Produce one `spec.html` per sub-feature folder:
```
src/features/{feature_name}/docs/{sub_feature}/spec.html
```
Also produce a root `src/features/{feature_name}/spec.html` that links to each sub-feature spec.

## Phase 1: Read All Source Docs

Glob and read every `.md` file under the target sub-feature's docs folder before writing any HTML. You need the full picture to build the sidebar nav, avoid repeating content, and know which components to use.

## Phase 2: Plan the Sections

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

## Phase 3: Write the HTML

Use the full page structure: CSS block, `<nav>`, `<main>`, JS scrollspy block.

### Component Rules

**`.flow` for every end-to-end flow and LangGraph graph**
- Translate ASCII diagrams directly into `.flow` divs.
- For LangGraph flows, show each node with its file annotation and state writes.

**`.filetree` for file structure**
- Use `<span class="dir">`, `<span class="file">`, `<span class="cmt">`.

**`<pre><code>` for all TypeScript**
- Render every interface, type, annotation block, graph construction snippet, and retry config as a code block.

**`.callout` for design decisions**
- `.callout.amber` for non-obvious "why" decisions.
- `.callout` (blue) for utility/pattern notes.
- `.callout.green` for confirmed/resolved open questions.

**`blockquote` for prerequisites and sequencing constraints**

**`.badge` in logging tables**
- Every logging level cell uses a badge. Never use plain text for log levels in tables.

**`.node` for named graph nodes inline in prose**

**Tables for all structured data**
- Trigger config, retry strategy, tech stack, Firestore collections, API functions, token budget.

### CSS Block (copy verbatim into every spec HTML)

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.7; color: #1a202c; background: #f7f8fa; display: flex; min-height: 100vh; }
nav { position: fixed; top: 0; left: 0; bottom: 0; width: 252px; background: #0f1117; overflow-y: auto; padding: 0 0 32px; flex-shrink: 0; z-index: 10; }
nav .brand { padding: 24px 20px 16px; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #5b8df5; border-bottom: 1px solid #1e2130; }
nav .brand span { display: block; color: #8b92a5; font-weight: 400; margin-top: 2px; font-size: 11px; letter-spacing: 0; text-transform: none; }
nav ul { list-style: none; padding: 12px 0; }
nav li a { display: block; padding: 6px 20px; color: #8b92a5; text-decoration: none; font-size: 13px; transition: color .15s; }
nav li a:hover, nav li a.active { color: #fff; }
nav .nav-section { padding: 14px 20px 4px; font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #3d4251; }
main { margin-left: 252px; flex: 1; padding: 40px 56px 80px; max-width: 960px; }
section { margin-bottom: 64px; }
section:first-child .page-title { margin-top: 0; }
.page-title { font-size: 28px; font-weight: 700; color: #0f1117; margin-bottom: 6px; }
.page-subtitle { color: #6b7280; font-size: 14px; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0; }
h2 { font-size: 20px; font-weight: 700; color: #0f1117; margin: 36px 0 14px; padding-bottom: 8px; border-bottom: 2px solid #5b8df5; }
h3 { font-size: 16px; font-weight: 600; color: #1a202c; margin: 24px 0 10px; }
h4 { font-size: 14px; font-weight: 600; margin: 20px 0 8px; color: #374151; }
p { margin-bottom: 12px; color: #374151; }
strong { color: #1a202c; }
a { color: #5b8df5; text-decoration: none; }
a:hover { text-decoration: underline; }
hr { border: none; border-top: 1px solid #e2e8f0; margin: 28px 0; }
ul, ol { padding-left: 22px; margin-bottom: 14px; }
li { margin-bottom: 5px; color: #374151; }
code { font-family: 'SF Mono', 'Fira Code', Consolas, monospace; font-size: 13px; background: #eef0f5; color: #c0392b; padding: 1px 5px; border-radius: 4px; }
pre { background: #1e2130; border-radius: 8px; padding: 20px; overflow-x: auto; margin: 14px 0 20px; border: 1px solid #2d3148; }
pre code { background: none; color: #c9d1d9; font-size: 13px; padding: 0; border-radius: 0; }
blockquote { border-left: 3px solid #f59e0b; background: #fffbeb; padding: 12px 16px; margin: 16px 0; border-radius: 0 6px 6px 0; color: #92400e; font-size: 14px; }
.table-wrap { overflow-x: auto; margin: 14px 0 20px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th { background: #f0f4ff; color: #374151; font-weight: 600; padding: 10px 14px; text-align: left; border-bottom: 2px solid #dbe4ff; }
td { padding: 9px 14px; border-bottom: 1px solid #e8ecf0; color: #374151; vertical-align: top; }
tr:last-child td { border-bottom: none; }
tr:nth-child(even) td { background: #f9fafb; }
.badge { display: inline-block; padding: 1px 7px; border-radius: 4px; font-size: 11px; font-weight: 700; font-family: 'SF Mono', monospace; letter-spacing: .03em; }
.badge-info { background: #dbeafe; color: #1d4ed8; }
.badge-warn { background: #fef3c7; color: #92400e; }
.badge-error { background: #fee2e2; color: #b91c1c; }
.badge-debug { background: #f3f4f6; color: #6b7280; }
.flow { background: #1e2130; border-radius: 8px; padding: 20px 24px; font-family: 'SF Mono', Consolas, monospace; font-size: 12.5px; color: #8be9fd; white-space: pre; overflow-x: auto; line-height: 1.6; border: 1px solid #2d3148; margin: 14px 0 20px; }
.node { display: inline-block; background: #0f1117; color: #5b8df5; border: 1px solid #2d3148; padding: 1px 8px; border-radius: 4px; font-family: 'SF Mono', monospace; font-size: 12px; }
.callout { background: #f0f4ff; border-left: 3px solid #5b8df5; padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 16px 0; font-size: 14px; color: #1e3a8a; }
.callout.green { background: #f0fdf4; border-color: #22c55e; color: #14532d; }
.callout.amber { background: #fffbeb; border-color: #f59e0b; color: #92400e; }
.filetree { background: #1e2130; border-radius: 8px; padding: 20px 24px; font-family: 'SF Mono', Consolas, monospace; font-size: 13px; color: #c9d1d9; white-space: pre; line-height: 1.8; border: 1px solid #2d3148; margin: 14px 0 20px; }
.filetree .dir { color: #5b8df5; }
.filetree .file { color: #c9d1d9; }
.filetree .cmt { color: #6b7587; }
```

### JS Scrollspy Block (copy verbatim at end of `<body>`)

```html
<script>
  const sections = document.querySelectorAll('section[id]');
  const links = document.querySelectorAll('nav a');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        links.forEach(l => l.classList.remove('active'));
        const active = document.querySelector(`nav a[href="#${entry.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { rootMargin: '-20% 0px -75% 0px' });
  sections.forEach(s => observer.observe(s));
</script>
```

## Phase 4: Verify Before Saving

Before writing the file:
1. Every section referenced in the nav exists as a `<section id="...">` in `<main>`.
2. Every `<pre><code>` block contains real content from the spec docs — no fabricated code.
3. Every `.flow` diagram is verbatim from the spec docs — not paraphrased.
4. The CSS block is the full verbatim block from above.
5. The JS scrollspy block is present at the end of `<body>`.
6. No external stylesheet or script dependencies — the file must be fully self-contained.

## Rules

- Never modify `.md` files — read only.
- Never fabricate technical detail that is not in the spec docs.
- Never produce a shallow document — every section must have substantial content from the source docs.
- If a sub-feature has only a placeholder `overview.md`, produce a `spec.html` that clearly marks it as a placeholder.
- Open questions from `tech-stack.md` must appear as `.callout.amber` blocks in the Infrastructure section.

---

## Checklist
- [ ] All `.md` files in the sub-feature folder read before any HTML written
- [ ] Sections planned and mapped to source docs
- [ ] CSS block included verbatim
- [ ] JS scrollspy block included verbatim at end of `<body>`
- [ ] All nav links have matching `<section id="...">` elements
- [ ] `.flow` components used for every flow diagram (verbatim from source)
- [ ] `.filetree` components used for file structure
- [ ] `.badge` components used in all logging tables
- [ ] `.callout.amber` used for open questions and design decisions with non-obvious "why"
- [ ] All code blocks contain only real content from spec docs (no fabricated code)
- [ ] No external dependencies — file self-contained
- [ ] Root `spec.html` with sub-feature links produced
