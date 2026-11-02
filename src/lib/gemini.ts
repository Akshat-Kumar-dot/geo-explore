/** Client for our own proxy. This module never contacts Google directly. */

const PROXY = '/api/generate';

export interface GenerateArgs {
  prompt: string;
  context?: string;
  system?: string;
  /** Ask the model for a JSON object rather than prose. */
  json?: boolean;
  signal?: AbortSignal;
}

export async function generate(args: GenerateArgs): Promise<string> {
  const res = await fetch(PROXY, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt: args.prompt, context: args.context, system: args.system, json: args.json,
    }),
    signal: args.signal,
  });
  if (!res.ok) throw new Error(`llm_unavailable_${res.status}`);
  const data = (await res.json()) as { text?: string };
  if (!data.text) throw new Error('llm_empty');
  return data.text;
}

/**
 * Pull a JSON object out of a model response. Handles ``` fences, leading prose
 * and trailing commentary. Returns null rather than throwing so callers can
 * fall back to a fixture — the demo must never surface a parse error.
 */
export function extractJson<T>(raw: string): T | null {
  if (!raw) return null;
  let text = raw.trim();

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  const tryParse = (s: string): T | null => {
    try { return JSON.parse(s) as T; } catch { return null; }
  };

  const direct = tryParse(text);
  if (direct) return direct;

  // Fall back to the outermost balanced brace span.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const span = tryParse(text.slice(start, end + 1));
    if (span) return span;
  }
  return null;
}

export async function proxyHealthy(): Promise<boolean> {
  try {
    const r = await fetch('/api/health');
    if (!r.ok) return false;
    const j = (await r.json()) as { key_configured?: boolean };
    return Boolean(j.key_configured);
  } catch { return false; }
}
