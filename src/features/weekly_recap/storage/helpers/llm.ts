import type { LLMResponse } from '../models';

export function isValidLLMPartial(partial: Partial<LLMResponse>): boolean {
  return (
    typeof partial.messageTitle === 'string' &&
    typeof partial.messageShortSummary === 'string' &&
    typeof partial.messageLongSummary === 'string' &&
    typeof partial.confidenceScore === 'number' &&
    Number.isInteger(partial.confidenceScore) &&
    partial.confidenceScore >= 0 &&
    partial.confidenceScore <= 100 &&
    Array.isArray(partial.newsLinks) &&
    Array.isArray(partial.eightKLinks)
  );
}

export function isRetryableLlmError(err: unknown): boolean {
  const status =
    (err as { status?: number; httpStatusCode?: number })?.status ??
    (err as { httpStatusCode?: number })?.httpStatusCode;
  const msg = (err as Error)?.message ?? '';
  return (
    status === 429 ||
    status === 500 ||
    status === 503 ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('DEADLINE_EXCEEDED') ||
    msg.includes('INTERNAL') ||
    msg.includes('quota') ||
    msg === 'Invalid LLM response schema'
  );
}

export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

export function stripMarkdown(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/gm, '')
    .replace(/\s*```$/gm, '')
    .replace(/\*{1,3}/g, '')
    .trim();
}
