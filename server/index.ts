import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* Gemini proxy. The API key is read from process.env only and never leaves
 * this process — the client talks to /api/generate, never to Google. */

const app = express();
const PORT = Number(process.env.PORT ?? 8787);
// Flash-Lite is Google's fastest text model; chat turns are short, so speed wins.
const MODEL = (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim();
// If the configured model is not available to this key, fall back rather than fail.
const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest'];
// A chat turn is short; a full production plan is a large JSON document and
// needs considerably longer. Each model attempt gets its own budget.
const CHAT_TIMEOUT_MS = 30_000;
const JSON_TIMEOUT_MS = 90_000;

app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

// Fixed-window rate limit, per IP.
const WINDOW_MS = 60_000, MAX_REQ = 20;
const hits = new Map<string, { count: number; resetAt: number }>();
app.use('/api/', (req, res, next) => {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else if (++entry.count > MAX_REQ) return res.status(429).json({ error: 'rate_limited' });
  next();
});

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, model: MODEL, key_configured: Boolean(process.env.GEMINI_API_KEY) }));

app.post('/api/generate', async (req, res) => {
  const started = Date.now();
  const { prompt, context, system, json } = req.body ?? {};
  if (typeof prompt !== 'string' || !prompt.trim())
    return res.status(400).json({ error: 'prompt_required' });

  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    console.warn('[generate] no GEMINI_API_KEY — client will use its fallback');
    return res.status(503).json({ error: 'llm_unavailable' });
  }

  const timeoutMs = json ? JSON_TIMEOUT_MS : CHAT_TIMEOUT_MS;

  const body: Record<string, unknown> = {
    contents: [{
      role: 'user',
      parts: [{ text: context ? `${prompt}\n\n<context>\n${context}\n</context>` : prompt }],
    }],
    generationConfig: {
      temperature: json ? 0.2 : 0.6,
      maxOutputTokens: json ? 16384 : 2048,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  /** One attempt against one model, with its own timeout. */
  async function attempt(model: string) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { method: 'POST', signal: ctrl.signal,
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(body) },
      );
      return { status: r.status, payload: (await r.json()) as any };
    } catch (err) {
      const aborted = (err as Error).name === 'AbortError';
      return { status: aborted ? 504 : 500, payload: null, aborted };
    } finally {
      clearTimeout(timer);
    }
  }

  const candidates = [MODEL, ...FALLBACK_MODELS.filter((m) => m !== MODEL)];
  // Retired names give 404/400; an overloaded or quota-capped model gives 503/429.
  // Both are worth trying on the next candidate.
  const WALK_ON = [404, 400, 503, 429];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let data: any = null;
  let used = MODEL;
  let lastStatus = 0;

  // Two passes: transient overload across every model is common, and a short
  // backoff usually clears it.
  outer: for (let pass = 0; pass < 2 && !data; pass++) {
    if (pass) await sleep(1500);
    for (const model of candidates) {
      const { status, payload } = await attempt(model);
      if (status === 200) { data = payload; used = model; break outer; }
      lastStatus = status;
      console.warn(`[generate] ${model} -> ${status} ${JSON.stringify(payload?.error?.message ?? '').slice(0, 140)}`);
      if (!WALK_ON.includes(status)) break outer;
    }
  }

  if (!data) {
    console.error(`[generate] all candidates failed, last status ${lastStatus}`);
    return res.status(lastStatus === 504 ? 504 : 502).json({ error: 'upstream_error', status: lastStatus });
  }

  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
  const finish = data?.candidates?.[0]?.finishReason;
  console.log(`[generate] ${used} ${Date.now() - started}ms  in=${prompt.length}b  out=${text.length}b  json=${!!json}  finish=${finish}`);

  if (!text) return res.status(502).json({ error: 'empty_response', finish });
  res.json({ text });
});

// In production (npm start, e.g. on Render) this one process also serves the built site from dist/.
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST));
  app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api/')
    ? res.sendFile(path.join(DIST, 'index.html'))
    : next()));
}

app.listen(PORT, () => console.log(`GeoExplore proxy on http://localhost:${PORT} (model ${MODEL})`));
