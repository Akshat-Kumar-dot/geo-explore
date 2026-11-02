/** Recharts' formatter signature is loose; this keeps call sites readable and typed. */
export const fmt =
  <T,>(fn: (value: T, name: string) => [string, string]) =>
    ((value: unknown, name: unknown) => fn(value as T, String(name ?? ''))) as never;
