// Module type stub for @confident-ai/deepeval.
// This package is not published on npm. The integration is fire-and-forget
// online tracing to the Confident AI dashboard. The stub allows the TypeScript
// compiler to accept dynamic imports while the actual runtime availability is
// checked via initDeepEval() at cold-start.
declare module '@confident-ai/deepeval' {
  export function monitor(options: { apiKey: string; projectName?: string }): void;
  export function traceCallback<T>(
    fn: () => Promise<T>,
    options?: {
      model?: string;
      inputTokenCount?: number;
      outputTokenCount?: number;
      traceAttributes?: Record<string, string>;
    },
  ): Promise<T>;
}
