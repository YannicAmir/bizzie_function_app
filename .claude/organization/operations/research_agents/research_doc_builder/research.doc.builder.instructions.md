---
name: research doc builder instructions
description: Step-by-step procedure for the Research Doc Builder agent to format the Synthesizer's output into a markdown file and place it at the correct location.
---

# Instructions for ResearchDocBuilder

## Purpose
Receive the structured synthesis output and write it to a clean, formatted markdown file. Place it at the user-specified path, or at the repository root if no path was given.

---

## Step 1 — Receive Inputs
Accept the following from the Synthesizer agent:
- The structured synthesis output.
- The original user query.
- The optional output path (may be absent).

---

## Step 2 — Derive the Filename
1. Derive a filename from the user query using `kebab-case` + `.research.md`.
   - Example: "flutter best practices for performance" → `flutter-best-practices-performance.research.md`
2. Keep it concise — max 5 meaningful words.

---

## Step 3 — Determine Placement
1. If the user provided an output path, place the file there.
2. If no path was provided, default to the repository root (`./<filename>.research.md`).
3. Create any intermediate directories if the path does not yet exist.

---

## Step 4 — Format the Document
Structure the file as:

```markdown
# <Topic Title — title case, derived from user query>

> Researched: <date>
> Query: <original user query>

## <Theme 1>
- <point>
- <point>
  _Source: Title — https://example.com_

## <Theme 2>
...

---

## Sources
1. Title — https://example.com
2. Title — https://example.com
```

Rules:
- One clear idea per bullet.
- Every theme section must carry at least one `_Source:_` attribution.
- Do not add interpretation, opinion, or content absent from the synthesis output.

---

## Step 5 — Write the File
Use the `execute` tool to write the formatted document to the determined path.

---

## Step 6 — Confirm to User
Report:
- The full file path where the document was saved.
- The number of sources included.

---

## Constraints
- Never invent content not present in the synthesis output.
- Filename must always end in `.research.md`.
- Do not overwrite an existing file — append a numeric suffix if a conflict exists (e.g., `flutter-best-practices-2.research.md`).
