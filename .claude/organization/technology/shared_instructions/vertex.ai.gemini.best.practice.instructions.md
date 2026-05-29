---
name: vertex ai gemini best practice
description: Best practices for Google Vertex AI Gemini API in Node.js TypeScript — structured JSON output, token budgets, model config, LangGraph node integration, and error handling.
---

# Instructions for Vertex AI / Gemini in Cloud Functions

## 1. SDK and initialization

Use `@google-cloud/vertexai`. Create one `VertexAI` instance at module scope:

```typescript
import { VertexAI, GenerativeModel, Part, Content } from '@google-cloud/vertexai';
import { config } from '../../../../core/config';

const vertexAI = new VertexAI({
  project: config.projectId,
  location: config.location, // 'us-central1'
});
```

## 2. Model resolution — always from Remote Config

Never hardcode a model name. Resolve it at runtime from Firebase Remote Config:

```typescript
import { remoteConfig } from '../../../../core/remote-config';

const modelName = await remoteConfig.getString('weekly_recap_model'); // e.g. 'gemini-2.0-flash'

const model: GenerativeModel = vertexAI.getGenerativeModel({
  model: modelName,
  generationConfig: {
    temperature: 0.2,          // low for deterministic structured output
    maxOutputTokens: 1024,
    responseMimeType: 'application/json',
    responseSchema: mySchema,   // see structured output below
  },
  systemInstruction: systemPrompt,
});
```

## 3. Structured JSON output

Always use `responseMimeType: 'application/json'` + `responseSchema` for structured output. This eliminates the need to parse markdown-wrapped JSON:

```typescript
import { SchemaType } from '@google-cloud/vertexai';

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    headline: { type: SchemaType.STRING },
    summary: { type: SchemaType.STRING },
    sentiment: { type: SchemaType.STRING, enum: ['bullish', 'bearish', 'neutral'] },
    keyPoints: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  },
  required: ['headline', 'summary', 'sentiment', 'keyPoints'],
};
```

When using `responseSchema`, the model returns raw JSON — no markdown fences. Still validate with `JSON.parse` in a try/catch.

## 4. Invoking the model

```typescript
const result = await retry(
  async () => {
    const response = await model.generateContent({ contents });
    const text = response.response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty LLM response');
    return JSON.parse(text) as MyOutputType;
  },
  {
    maxAttempts: 3,
    initialDelayMs: 2000,
    backoffFactor: 2,
    shouldRetry: isTransientVertexError,
  },
);
```

## 5. Transient vs permanent errors

```typescript
function isTransientVertexError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? '';
  const status = (err as any)?.status ?? (err as any)?.httpStatusCode;
  return (
    status === 429 || status === 500 || status === 503 ||
    msg.includes('UNAVAILABLE') || msg.includes('DEADLINE_EXCEEDED') ||
    msg.includes('INTERNAL') || msg.includes('quota')
  );
  // NOT transient: 400 (bad request), 401/403 (auth), 404 (model not found)
}
```

LLM retry config: `maxAttempts: 3`, `initialDelayMs: 2000`.

## 6. Token budget management

Truncate text inputs BEFORE assembling the prompt:

```typescript
function truncateToTokens(text: string, maxTokens: number): string {
  // Approximation: 1 token ≈ 0.75 words ≈ 4 characters
  const maxChars = maxTokens * 4;
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

// Per the spec:
const truncatedNews = newsItem.text ? truncateToTokens(newsItem.text, 500) : '';
const truncatedPr = prItem.text ? truncateToTokens(prItem.text, 750) : '';
```

Log the estimated token count per invocation at `info` level.

## 7. Prompt construction

Separate system instruction from user content:

```typescript
const systemPrompt = `You are a financial analyst writing weekly market summaries...`;

const userContent: Content = {
  role: 'user',
  parts: [{ text: assemblePromptText(marketData) }],
};

const contents: Content[] = [userContent];
// systemInstruction is set in GenerativeModel config, not contents array
```

Keep prompts deterministic: avoid "be creative" instructions when structured output is required.

## 8. Post-processing LLM output

Even with `responseSchema`, validate and sanitize:

```typescript
function postProcess(raw: unknown): MyOutputType {
  // Strip any residual markdown fences (defensive)
  const text = typeof raw === 'string'
    ? raw.replace(/^```json\s*/m, '').replace(/\s*```$/m, '').trim()
    : JSON.stringify(raw);

  const parsed = JSON.parse(text) as MyOutputType;

  // Validate required fields
  if (!parsed.headline || !parsed.summary) {
    throw new Error('LLM output missing required fields');
  }

  return parsed;
}
```

## 9. LangGraph node integration

In LangGraph nodes, the LLM call is one step in the state graph:

```typescript
async function summarizeNews(state: WeeklyRecapState): Promise<Partial<WeeklyRecapState>> {
  const result = await aiService.generateSummary(state.marketData);
  return { llmPartial: result };
}
```

Keep LLM calls inside service methods (`ai_service.ts`), not directly in node functions. Nodes orchestrate; services call the API.

## 10. Anti-patterns to avoid

- Never hardcode model names — always resolve from Remote Config
- Never skip `responseSchema` — unstructured output requires fragile parsing
- Never put truncation logic inside `ai_service.ts` — truncate in the calling node before passing data
- Never ignore empty `candidates` or `parts` — treat as a transient error and retry

---

## Checklist

- [ ] Single `VertexAI` instance at module scope
- [ ] Model name resolved from Firebase Remote Config, not hardcoded
- [ ] `responseMimeType: 'application/json'` + `responseSchema` set for structured output
- [ ] All LLM calls wrapped with `retry()` — `maxAttempts: 3`, `initialDelayMs: 2000`
- [ ] Token truncation applied before prompt assembly (news: 500 tokens, PR: 750 tokens)
- [ ] Empty `candidates` / `parts` treated as transient error
- [ ] Output validated and post-processed after parsing
- [ ] LLM call in `ai_service.ts`, not directly in LangGraph node functions
