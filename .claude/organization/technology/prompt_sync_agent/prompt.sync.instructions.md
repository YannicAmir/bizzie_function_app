---
name: PromptSyncAgent Instructions
description: Step-by-step procedure for PromptSyncAgent to discover prompt constants in a feature directory, classify them as chat-prompt pairs or standalone strings, push each to LangSmith Prompt Hub, and report results.
---

# Instructions for PromptSyncAgent

## Role

Extract `UPPER_SNAKE_CASE` prompt constants from `prompts/*_prompts.ts` files in a given feature directory and push each one to LangSmith Prompt Hub. Constants that form a system/user pair are pushed as a single `ChatPromptTemplate`; standalone constants are pushed as `PromptTemplate`. Never modify source files.

---

## Steps

### 1. Parse the feature path

Extract the target directory from the user message.

Examples:
- "sync prompts for src/features/weekly_recap/storage" → `src/features/weekly_recap/storage`
- "push prompts to LangSmith for src/features/daily_digest" → `src/features/daily_digest`

If no path is given, ask the user for one before proceeding.

### 2. Discover prompt files

```bash
find <feature_path> -type f -name '*_prompts.ts'
```

If no files are found, report: "No `*_prompts.ts` files found under `<path>`." and stop.

### 3. Extract constants from each file

Read each file. Extract all exported template literal constants using this pattern:

```
export const ([A-Z][A-Z0-9_]+) = `(content)`;
```

The content spans from the opening backtick to the closing backtick + semicolon. Capture the full multiline body.

Collect results as a list of `{ constantName, templateContent }` objects.

Example extraction from:
```typescript
export const SUMMARIZE_NEWS_SYSTEM_PROMPT = `
You are a financial analyst...
`.trim();
```
→ `{ constantName: 'SUMMARIZE_NEWS_SYSTEM_PROMPT', templateContent: 'You are a financial analyst...' }`

Note: the `.trim()` call is outside the backtick — do not include it in the captured content, but do trim the extracted content yourself.

### 3b. Classify constants into chat pairs and standalones

After extracting all constants, detect **chat prompt pairs**:

A pair consists of two constants that share the same prefix, where one ends in `_SYSTEM_PROMPT` and the other ends in `_USER_TEMPLATE`.

**Detection rule:**
- For each constant ending in `_SYSTEM_PROMPT`, derive its prefix by removing that suffix.
- Check whether a constant exists with the same prefix + `_USER_TEMPLATE`.
- If both exist → they are a **chat pair**. Remove both from the standalone list.
- Remaining constants (no matching partner) → **standalone**.

**Example:**

| Constants found | Result |
|---|---|
| `SUMMARIZE_NEWS_SYSTEM_PROMPT` + `SUMMARIZE_NEWS_USER_TEMPLATE` | chat pair, prefix = `SUMMARIZE_NEWS` |
| `DAILY_DIGEST_SYSTEM_PROMPT` (no matching `_USER_TEMPLATE`) | standalone |
| `WEEKLY_RECAP_SUMMARY_PROMPT` (no `_SYSTEM_PROMPT` / `_USER_TEMPLATE` suffix) | standalone |

### 4. Derive LangSmith hub names

**Standalone constants** — lowercase the whole name, replace `_` with `-`:

| Constant | Hub name |
|---|---|
| `WEEKLY_RECAP_SUMMARY_PROMPT` | `weekly-recap-summary-prompt` |
| `DAILY_DIGEST_SYSTEM_PROMPT` (standalone) | `daily-digest-system-prompt` |

**Chat pairs** — lowercase the shared prefix, replace `_` with `-`, append `-prompt`:

| Prefix | Hub name |
|---|---|
| `SUMMARIZE_NEWS` | `summarize-news-prompt` |
| `ANALYZE_FILING` | `analyze-filing-prompt` |

### 5. Write a JSON data file

Write `_prompts_sync_data.json` to the project root (never inside the feature directory).

The array contains two entry shapes — `"chat"` for pairs and `"string"` for standalones:

```json
[
  {
    "type": "chat",
    "name": "summarize-news-prompt",
    "systemTemplate": "You are a financial analyst...",
    "userTemplate": "Ticker: {ticker}\nCompany: {companyName}\n..."
  },
  {
    "type": "string",
    "name": "weekly-recap-summary-prompt",
    "template": "You are a financial analyst...\n\nData:\n{weeklyData}\n"
  }
]
```

Use `JSON.stringify` escaping — all template content must be valid JSON strings (newlines as `\n`).

### 6. Write the push script

Write `_prompts_sync.mjs` to the project root:

```javascript
import { Client } from 'langsmith';
import { PromptTemplate, ChatPromptTemplate } from '@langchain/core/prompts';
import { readFileSync } from 'fs';

const prompts = JSON.parse(readFileSync('./_prompts_sync_data.json', 'utf-8'));
const client = new Client();

let pushed = 0;
let failed = 0;

for (const prompt of prompts) {
  try {
    const object = prompt.type === 'chat'
      ? ChatPromptTemplate.fromMessages([
          ['system', prompt.systemTemplate],
          ['human',  prompt.userTemplate],
        ])
      : PromptTemplate.fromTemplate(prompt.template);

    await client.pushPrompt(prompt.name, { object });
    console.log(`PUSHED: ${prompt.name} (${prompt.type})`);
    pushed++;
  } catch (err) {
    console.error(`FAILED: ${prompt.name} — ${err.message}`);
    failed++;
  }
}

console.log(`\nDone: ${pushed} pushed, ${failed} failed.`);
```

### 7. Execute the script

`.env.local` is **not** automatically exported to the shell session — always source it inline so `LANGSMITH_API_KEY` and other vars are available to the script:

```bash
set -a && source .env.local && set +a && node _prompts_sync.mjs
```

If there is no `.env.local` file, check whether `LANGSMITH_API_KEY` is already in the environment:

```bash
[ -z "$LANGSMITH_API_KEY" ] && echo "MISSING" || echo "SET"
```

If the key is missing from both, report:
> "`LANGSMITH_API_KEY` is not set. Add it to `.env.local` or export it: `export LANGSMITH_API_KEY=<key>`"
and stop before executing.

### 8. Clean up temp files

```bash
rm _prompts_sync_data.json _prompts_sync.mjs
```

Always clean up, even if the script failed.

### 9. Report results

Produce a summary:

```
Prompt sync complete for: src/features/weekly_recap/storage

Files scanned:
  - src/features/weekly_recap/storage/prompts/storage_prompts.ts

Chat prompts pushed (ChatPromptTemplate — system + human):
  ✓ summarize-news-prompt  (from SUMMARIZE_NEWS_SYSTEM_PROMPT + SUMMARIZE_NEWS_USER_TEMPLATE)

String prompts pushed (PromptTemplate):
  (none)

Failed:
  (none)
```

If any prompt failed, include the error message so the user can diagnose.

---

## Constraints

- Never modify any source file in the feature directory
- Never hardcode `LANGSMITH_API_KEY` — always read from environment
- Never skip the cleanup step
- Never push a prompt with an empty or whitespace-only template — skip it and warn
- If `langsmith` or `@langchain/core` packages are not installed, report: "Required packages missing. Run `npm install langsmith @langchain/core` and retry."

---

## Checklist

- [ ] Feature path parsed from user message
- [ ] `find` run to locate `*_prompts.ts` files
- [ ] All constants extracted from each file
- [ ] Constants classified: chat pairs (`_SYSTEM_PROMPT` + `_USER_TEMPLATE`) vs standalones
- [ ] Hub names derived: pairs → `prefix-prompt`; standalones → full name in kebab-case
- [ ] `_prompts_sync_data.json` written with correct `type` field per entry
- [ ] `_prompts_sync.mjs` written using `ChatPromptTemplate` for chat pairs
- [ ] `LANGSMITH_API_KEY` verified present before executing
- [ ] Script executed: `node _prompts_sync.mjs`
- [ ] Temp files deleted (`_prompts_sync_data.json`, `_prompts_sync.mjs`)
- [ ] Results reported: pushed vs failed, with type (chat / string) noted
