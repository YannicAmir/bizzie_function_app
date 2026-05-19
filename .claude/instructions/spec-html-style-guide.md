# Bizzie Spec HTML Style Guide

## Purpose

This style guide governs every HTML spec document produced for the Bizzie Function App. The canonical reference implementation is `src/features/weekly_recap/spec.html`. All agents that produce or update spec HTML must follow this guide exactly — consistency across features is the goal.

The HTML output is a **visualization tool for the developer**, not a markdown dump. Use the full component library to make the spec as scannable and contextually rich as possible: code blocks, flow diagrams, callouts, mockups, file trees, and logging tables should all appear where relevant.

---

## Layout

Every spec HTML file uses a **fixed left sidebar + scrollable main content** layout.

```
<body>                       ← flex container
  <nav>                      ← fixed, 252px wide, dark background
  <main>                     ← margin-left: 252px, max-width: 960px
    <section id="...">       ← one section per major topic
```

The sidebar contains:
- A `.brand` block at the top (feature name + subtitle)
- One or more `.nav-section` labels (uppercase, muted)
- `<a href="#section-id">` links for each section

The main area contains sections. Each section has a `.page-title`, a `.page-subtitle`, and then the content.

---

## Full CSS Block

Copy this CSS block verbatim into every spec HTML file. Do not modify it — changes must be made to this style guide first.

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 15px;
  line-height: 1.7;
  color: #1a202c;
  background: #f7f8fa;
  display: flex;
  min-height: 100vh;
}

/* ── Sidebar ── */
nav {
  position: fixed;
  top: 0; left: 0; bottom: 0;
  width: 252px;
  background: #0f1117;
  overflow-y: auto;
  padding: 0 0 32px;
  flex-shrink: 0;
  z-index: 10;
}
nav .brand {
  padding: 24px 20px 16px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: #5b8df5;
  border-bottom: 1px solid #1e2130;
}
nav .brand span { display: block; color: #8b92a5; font-weight: 400; margin-top: 2px; font-size: 11px; letter-spacing: 0; text-transform: none; }
nav ul { list-style: none; padding: 12px 0; }
nav li a {
  display: block;
  padding: 6px 20px;
  color: #8b92a5;
  text-decoration: none;
  font-size: 13px;
  transition: color .15s;
}
nav li a:hover, nav li a.active { color: #fff; }
nav .nav-section {
  padding: 14px 20px 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: #3d4251;
}

/* ── Main ── */
main {
  margin-left: 252px;
  flex: 1;
  padding: 40px 56px 80px;
  max-width: 960px;
}

section { margin-bottom: 64px; }
section:first-child .page-title { margin-top: 0; }

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: #0f1117;
  margin-bottom: 6px;
}
.page-subtitle {
  color: #6b7280;
  font-size: 14px;
  margin-bottom: 32px;
  padding-bottom: 20px;
  border-bottom: 1px solid #e2e8f0;
}

h2 {
  font-size: 20px;
  font-weight: 700;
  color: #0f1117;
  margin: 36px 0 14px;
  padding-bottom: 8px;
  border-bottom: 2px solid #5b8df5;
}
h3 {
  font-size: 16px;
  font-weight: 600;
  color: #1a202c;
  margin: 24px 0 10px;
}
h4 { font-size: 14px; font-weight: 600; margin: 20px 0 8px; color: #374151; }

p { margin-bottom: 12px; color: #374151; }
strong { color: #1a202c; }
a { color: #5b8df5; text-decoration: none; }
a:hover { text-decoration: underline; }

hr { border: none; border-top: 1px solid #e2e8f0; margin: 28px 0; }

ul, ol { padding-left: 22px; margin-bottom: 14px; }
li { margin-bottom: 5px; color: #374151; }

code {
  font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
  font-size: 13px;
  background: #eef0f5;
  color: #c0392b;
  padding: 1px 5px;
  border-radius: 4px;
}

pre {
  background: #1e2130;
  border-radius: 8px;
  padding: 20px;
  overflow-x: auto;
  margin: 14px 0 20px;
  border: 1px solid #2d3148;
}
pre code {
  background: none;
  color: #c9d1d9;
  font-size: 13px;
  padding: 0;
  border-radius: 0;
}

blockquote {
  border-left: 3px solid #f59e0b;
  background: #fffbeb;
  padding: 12px 16px;
  margin: 16px 0;
  border-radius: 0 6px 6px 0;
  color: #92400e;
  font-size: 14px;
}

/* ── Tables ── */
.table-wrap { overflow-x: auto; margin: 14px 0 20px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th {
  background: #f0f4ff;
  color: #374151;
  font-weight: 600;
  padding: 10px 14px;
  text-align: left;
  border-bottom: 2px solid #dbe4ff;
}
td { padding: 9px 14px; border-bottom: 1px solid #e8ecf0; color: #374151; vertical-align: top; }
tr:last-child td { border-bottom: none; }
tr:nth-child(even) td { background: #f9fafb; }

/* ── Badges ── */
.badge {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  font-family: 'SF Mono', monospace;
  letter-spacing: .03em;
}
.badge-info  { background: #dbeafe; color: #1d4ed8; }
.badge-warn  { background: #fef3c7; color: #92400e; }
.badge-error { background: #fee2e2; color: #b91c1c; }
.badge-debug { background: #f3f4f6; color: #6b7280; }

/* ── Flow diagram ── */
.flow {
  background: #1e2130;
  border-radius: 8px;
  padding: 20px 24px;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 12.5px;
  color: #8be9fd;
  white-space: pre;
  overflow-x: auto;
  line-height: 1.6;
  border: 1px solid #2d3148;
  margin: 14px 0 20px;
}

/* ── Node tag ── */
.node {
  display: inline-block;
  background: #0f1117;
  color: #5b8df5;
  border: 1px solid #2d3148;
  padding: 1px 8px;
  border-radius: 4px;
  font-family: 'SF Mono', monospace;
  font-size: 12px;
}

/* ── Callout ── */
.callout {
  background: #f0f4ff;
  border-left: 3px solid #5b8df5;
  padding: 12px 16px;
  border-radius: 0 6px 6px 0;
  margin: 16px 0;
  font-size: 14px;
  color: #1e3a8a;
}
.callout.green { background: #f0fdf4; border-color: #22c55e; color: #14532d; }
.callout.amber { background: #fffbeb; border-color: #f59e0b; color: #92400e; }

/* ── File tree ── */
.filetree {
  background: #1e2130;
  border-radius: 8px;
  padding: 20px 24px;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 13px;
  color: #c9d1d9;
  white-space: pre;
  line-height: 1.8;
  border: 1px solid #2d3148;
  margin: 14px 0 20px;
}
.filetree .dir  { color: #5b8df5; }
.filetree .file { color: #c9d1d9; }
.filetree .cmt  { color: #6b7587; }
```

---

## JavaScript Block

Copy this script verbatim at the end of `<body>` in every spec HTML file. It highlights the active sidebar link as the user scrolls.

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

---

## Component Library

Use the right component for each content type. Never use plain prose where a component is available.

### `.flow` — Architecture and execution flow diagrams

Use for any ASCII end-to-end flow, LangGraph node graph, or sequence diagram. Content is `white-space: pre` in cyan on dark. Preserve all spacing exactly.

```html
<div class="flow">Cloud Scheduler
       │
       ▼
weeklyRecapScheduler  [trigger.ts]
  retrieveCompaniesFromDb()  ── reads Firestore: watchlist/{ticker}
  queueCompanies(companies)  ── publishes { ticker } per Company</div>
```

### `.filetree` — File and directory structure

Use for showing the source file layout. Wrap directory names in `<span class="dir">`, filenames in `<span class="file">`, inline comments in `<span class="cmt">`.

```html
<div class="filetree"><span class="dir">src/features/my_feature/</span>
└── <span class="file">trigger.ts</span>   <span class="cmt"># entry point</span></div>
```

### `.callout` — Important notes and decisions

Use for non-obvious design decisions, key constraints, or "why X over Y" explanations. Use modifier classes for severity:
- `.callout` (default, blue) — informational
- `.callout.green` — confirmed/resolved
- `.callout.amber` — caution, open question, known risk

```html
<div class="callout amber"><strong>Promise.allSettled — not Promise.all.</strong> Promise.all aborts all calls on first failure. allSettled is independent per call — one failure defaults to [] and the graph continues.</div>
```

### `blockquote` — Prerequisites and "do this before that" notes

Use for setup steps that must happen before code is deployed, or for ordering constraints.

```html
<blockquote>Do this after the first deployment. Firebase creates the push subscription on first deploy — it does not exist until then.</blockquote>
```

### `.badge` — Log level indicators

Use inline inside table cells for the logging spec. Never use them as decorative labels elsewhere.

```html
<span class="badge badge-info">info</span>
<span class="badge badge-warn">warn</span>
<span class="badge badge-error">error</span>
<span class="badge badge-debug">debug</span>
```

### `.node` — LangGraph node names and function identifiers

Use inline for named graph nodes, function names in flow descriptions, or Pub/Sub topic names when they appear inline in prose.

```html
<span class="node">fetchMarketData</span>
```

### `.table-wrap` + `<table>` — All structured data

Wrap every table in `<div class="table-wrap">` for horizontal scroll on narrow viewports.

```html
<div class="table-wrap"><table>
  <tr><th>Config</th><th>Value</th></tr>
  <tr><td>Memory</td><td><code>512MiB</code></td></tr>
</table></div>
```

### `<pre><code>` — Code blocks and TypeScript interfaces

Use for all TypeScript, JSON, and shell code. The dark background with light text is applied by CSS automatically.

### `<code>` inline — Identifiers

Use for all: function names, file names, collection paths, environment variable names, topic names, config keys, type names, and any literal value that would appear in code.

---

## HTML Page Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{Feature} — {Sub-feature} Spec</title>
  <style>
    /* paste full CSS block here */
  </style>
</head>
<body>

<nav>
  <div class="brand">{Feature Name}<span>{Sub-feature} — Spec v1.0</span></div>
  <ul>
    <li class="nav-section">{Group Label}</li>
    <li><a href="#section-id">Section Title</a></li>
    <!-- ... -->
  </ul>
</nav>

<main>
  <section id="section-id">
    <div class="page-title">Section Title</div>
    <div class="page-subtitle">One-sentence description or file path</div>
    <!-- content -->
  </section>
  <!-- ... -->
</main>

<!-- paste JS block here -->
</body>
</html>
```

---

## Section Naming Conventions

Group sidebar nav links under these standard section labels (use only what is relevant):

| Nav section label | Covers |
|---|---|
| Overview | Pipeline overview, file structure, end-to-end flow |
| Entry Points | `trigger.ts`, schedulers, HTTP handlers |
| Orchestration | LangGraph graph, `usecase.ts`, nodes |
| Data | Data models, Firestore schemas, interfaces |
| Services | One entry per `services/*.ts` file |
| Infrastructure | Tech stack, retry strategy, env/secrets, token budget |
| Logging | Logging spec per file |
| Setup | One-time GCP/Firebase setup steps |

---

## Content Depth Expectations

The HTML spec is a **visualization tool for the developer** — not a restatement of the markdown. It should give maximum implementation context. For each section:

- **Overview / flow sections**: always include a `.flow` diagram showing the full end-to-end path with file annotations.
- **File structure sections**: always use `.filetree` with coloured spans.
- **Service sections**: always include the TypeScript retry config as `<pre><code>`, function signatures, endpoint URLs, and key constraints as `.callout`.
- **Data model sections**: always include TypeScript interface blocks as `<pre><code>` and Firestore schemas as `<pre><code>`.
- **Node / usecase sections**: always include the LangGraph state annotation and graph construction code as `<pre><code>`. Use `.callout.amber` for non-obvious routing decisions.
- **Logging sections**: always use the `.badge` components in a table — never plain text log levels.
- **Setup sections**: always use numbered `<ol>` with `blockquote` for prerequisites.
- **Open questions / TODOs**: render as `.callout.amber` blocks, not as plain text.

Omit sections that have no content. Never pad with placeholder text.

---

## Color Reference

| Token | Hex | Used for |
|---|---|---|
| Sidebar bg | `#0f1117` | `nav` background, `.node` background |
| Code block bg | `#1e2130` | `pre`, `.flow`, `.filetree` |
| Code border | `#2d3148` | `pre`, `.flow`, `.filetree`, `.node` border |
| Page bg | `#f7f8fa` | `body` background |
| Primary accent | `#5b8df5` | `h2` border, links, brand text, `.callout` border |
| Cyan (flow text) | `#8be9fd` | `.flow` text color |
| Dir blue | `#5b8df5` | `.filetree .dir` |
| Body text | `#1a202c` | primary text |
| Secondary text | `#374151` | `p`, `li`, `td` |
| Muted text | `#6b7280` | `.page-subtitle`, sidebar inactive links |
| Inline code bg | `#eef0f5` | `code` background |
| Inline code text | `#c0392b` | `code` text color |
| Code text | `#c9d1d9` | `pre code` text |
| Table header bg | `#f0f4ff` | `th` background |
| Table header border | `#dbe4ff` | `th` bottom border |
| Amber accent | `#f59e0b` | `blockquote` border, `.callout.amber` border |
