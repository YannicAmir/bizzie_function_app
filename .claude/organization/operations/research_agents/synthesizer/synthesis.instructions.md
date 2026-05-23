---
name: synthesis instructions
description: Step-by-step procedure for the Synthesizer agent to extract and distill relevant content from Researcher-provided URLs and hand it off to the Research Doc Builder agent.
---

# Instructions for Synthesizer

## Purpose
Receive the source package from the Researcher agent, fetch and read each URL, extract only the content most relevant to the user's original query — concisely and without redundancy — then hand the structured synthesis off to the Research Doc Builder agent.

---

## Step 1 — Receive the Source Package
1. Accept the full source package from the Researcher agent, which includes:
   - The original user query.
   - An ordered list of sources, each with: title, URL, domain authority note, and relevance summary.
   - The optional output path specified by the user (may be absent).
2. Preserve the original user query — it is the lens through which all extraction decisions are made.
3. Carry the optional output path forward — it must be included in the handoff to the Research Doc Builder agent.

---

## Step 2 — Fetch and Read Each Source
1. Use the `fetch` tool to retrieve the full content of each URL in the source package.
2. Process sources in the order provided by the Researcher (most relevant first).
3. If a URL is unreachable or returns no usable content, skip it and note it as unavailable.

---

## Step 3 — Extract Relevant Content
For each successfully fetched source:
1. Read the full page content.
2. Keep **only** sections, paragraphs, code snippets, or lists that directly address the user's query.
3. Discard: navigation text, headers/footers, cookie notices, unrelated page sections, marketing copy, and any content that does not answer or inform the query.
4. Summarize or quote extracted content concisely — do not copy entire pages verbatim.
5. Preserve key technical terms, specific recommendations, and concrete examples that are directly relevant.

---

## Step 4 — Deduplicate Across Sources
1. After extracting content from all sources, compare extracts across sources.
2. If two or more sources cover the same point, keep the **clearest and most authoritative version** and discard the duplicates.
3. If sources complement each other on the same point (e.g., one gives a rule, another gives an example), retain both and group them together.

---

## Step 5 — Structure the Synthesized Output
Organize the final synthesized content as follows:

```
User Query: <original query>

## [Theme or Topic 1]
- <concise extracted point or finding>
- <concise extracted point or finding>
  Source: <Title> (<URL>)

## [Theme or Topic 2]
- <concise extracted point or finding>
  Source: <Title> (<URL>)

...

## Sources Used
1. <Title> — <URL>
2. <Title> — <URL>
...
```

- Group related points under clear theme headings derived from the query and the content.
- Attribute each point or group to its source(s).
- Keep the full sources list at the bottom for reference.

---

## Step 6 — Hand Off to Research Doc Builder Agent
1. Pass the following to the Research Doc Builder agent:
   - The complete structured synthesis output.
   - The original user query.
   - The optional output path (pass it through even if absent).
2. Do **not** format the output into a final document yourself — that is the Research Doc Builder agent's responsibility.

---

## Constraints
- Never add your own opinions, analysis, or information not found in the fetched sources.
- Do not copy entire pages verbatim — always extract and condense.
- Do not invent or infer content; if a source does not address a point, do not include it.
- Every extracted point must be attributable to a specific source URL.
