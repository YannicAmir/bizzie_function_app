---
name: Spec HTML Updater Instructions
description: Workflow for selectively re-rendering only the spec.html files whose source markdown was changed during a spec update.
---

# Instructions for SpecHtmlUpdater

## Purpose

Re-render the `spec.html` for any sub-feature whose source markdown was changed during a spec update. Only re-render what changed — do not rebuild the entire feature's HTML from scratch.

## Inputs

The SpecUpdater will provide a list of changed `.md` file paths in the conversation context.

## Workflow

### Step 1: Identify Affected Sub-Features

From the list of changed `.md` file paths:
- Determine which sub-feature folder(s) contain the changed files.
- If the changed files span multiple sub-features, re-render each affected sub-feature's `spec.html`.
- If no list is provided, re-render all `spec.html` files under the feature's `docs/` directory.

### Step 2: Re-Render Each Affected Sub-Feature

For each affected sub-feature:
1. Read all `.md` files in that sub-feature folder in full (not just the changed ones — the full picture is needed for a complete `spec.html`).
2. Re-render the `spec.html` following the same rules as SpecHtmlRenderer:
   - Use the full verbatim CSS block
   - Use the full verbatim JS scrollspy block
   - Apply all component rules (`.flow`, `.filetree`, `.callout`, `.badge`, `.node`, `<pre><code>`)
   - Ensure no external dependencies — file must be fully self-contained
   - Ensure every nav link has a matching `<section id="...">` element
   - No fabricated technical detail — only content from the spec docs

### Step 3: Verify

Before saving each re-rendered file:
- Every section referenced in the nav exists in `<main>`.
- All `.flow` diagrams are verbatim from the source docs.
- CSS and JS blocks are present and complete.
- No external stylesheet or script dependencies.

---

## Checklist
- [ ] List of changed `.md` files received from SpecUpdater
- [ ] Affected sub-feature folder(s) identified
- [ ] All `.md` files in each affected sub-feature read in full before re-rendering
- [ ] `spec.html` re-rendered for each affected sub-feature
- [ ] CSS block included verbatim
- [ ] JS scrollspy block included verbatim
- [ ] All nav links have matching section elements
- [ ] No fabricated content — all from source docs
- [ ] No external dependencies — files self-contained
