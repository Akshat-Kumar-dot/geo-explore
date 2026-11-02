import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Paperclip, ArrowUp, WifiOff } from 'lucide-react';
import { useChatStore, useMessages, type Screen } from '../../stores/chatStore';
import { generate, extractJson } from '../../lib/gemini';
import { systemFor, contextFor } from './systemPrompt';
import { localAnswer } from './localAnswers';
import { runActions, type ChatAction } from '../../lib/chatActions';
import { ZoneDetailCard, MineDetailCard } from './DetailCards';

interface LlmReply {
  reply?: string;
  actions?: ChatAction[];
  focus_zone?: string | null;
  focus_mine?: string | null;
}

const SUGGESTIONS: Record<Screen, string[]> = {
  map: ['Show 10', 'Show Bailadila', 'Take me to Noamundi', 'Which targets sit on constrained land?'],
  plan: ['Tell me about Joda East', 'Why is the equipment programme in weeks 9–14?', 'Rainfall at 140%'],
};

export default function ChatPanel({
  screen, className = '',
}: { screen: Screen; className?: string }) {
  const messages = useMessages(screen);
  const streaming = useChatStore((s) => s.streaming);
  const [input, setInput] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || streaming) return;
    const chat = useChatStore.getState();
    setInput('');
    chat.push(screen, { role: 'user', content: q });
    chat.setStreaming(true);
    const id = chat.push(screen, { role: 'assistant', content: '', pending: true });

    // Computed first: it is both the fallback and the source of truth for ids.
    const local = localAnswer(q, screen);

    try {
      const raw = await generate({
        prompt: q,
        system: systemFor(screen),
        context: contextFor(screen),
        json: true,
      });
      const parsed = extractJson<LlmReply>(raw);
      if (!parsed?.reply) throw new Error('unusable_response');

      const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
      const trace = await runActions(actions);
      chat.patch(screen, id, {
        content: parsed.reply.trim(),
        pending: false,
        trace,
        focusZone: parsed.focus_zone ?? local.focusZone,
        focusMine: parsed.focus_mine ?? local.focusMine,
      });
    } catch {
      // No key, no network, or an unusable response — answer from the loaded data.
      const trace = await runActions(local.actions);
      chat.patch(screen, id, {
        content: local.reply,
        pending: false,
        trace,
        offline: true,
        focusZone: local.focusZone,
        focusMine: local.focusMine,
      });
    } finally {
      chat.setStreaming(false);
    }
  }

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div ref={scroller} className="flex-1 overflow-y-auto scroll-thin px-5 py-4 min-h-0">
        {messages.map((m) => m.role === 'user' ? (
          <div key={m.id} className="flex justify-end mb-5">
            <div className="max-w-[290px] rounded-[10px] bg-bubble px-3.5 py-2.5 text-[13.5px] leading-[1.45] text-ink">
              {m.content}
            </div>
          </div>
        ) : (
          <div key={m.id} className="flex gap-3 mb-6">
            <div className="w-[30px] h-[30px] shrink-0 rounded-[10px] bg-brand grid place-items-center mt-0.5">
              <svg width="17" height="12" viewBox="25 240 25 18">
                <path d="M27 256 l10-13 11 13 -5 0 -6-7 -5 7z" fill="none" stroke="#fff" strokeWidth="1.5" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              {m.pending ? (
                <div className="flex gap-1.5 items-center h-6">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="dot w-[5px] h-[5px] rounded-full bg-muted" style={{ animationDelay: `${i * 0.16}s` }} />
                  ))}
                </div>
              ) : (
                <>
                  <div className="chat-md text-ink"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown></div>

                  {m.focusZone && <ZoneDetailCard zoneId={m.focusZone} />}
                  {m.focusMine && <MineDetailCard mineId={m.focusMine} />}

                  {m.trace && m.trace.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {m.trace.map((t, i) => (
                        <span key={i} className="text-[10.5px] text-[#4a6a86] bg-[#eef4fa] border border-[#dbe7f2] rounded-full px-2 py-[3px]">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {m.offline && (
                    <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-[#93a0b1]">
                      <WifiOff size={10} /> answered from loaded data — no model key configured
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}

        {messages.length <= 1 && (
          <div className="flex flex-col items-start gap-2 pl-[42px]">
            {SUGGESTIONS[screen].map((s) => (
              <button key={s} className="btn !h-auto !py-1.5 !text-[12.5px] text-left" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 pb-4 pt-1">
        <div className="rounded-[9px] bg-white border border-lineStrong focus-within:border-[#9fb3ca] transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }}
            rows={2}
            placeholder={screen === 'map' ? 'Ask about the map, or tell it what to do…' : 'Ask about production, risk, or the plan…'}
            className="w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-[13px] leading-[1.5] text-ink placeholder:text-[#7d8ea3] outline-none"
          />
          <div className="flex items-center justify-between px-2.5 pb-2.5">
            <button aria-label="Attach a file" className="p-1.5 text-[#54637a] hover:text-ink transition-colors">
              <Paperclip size={16} strokeWidth={1.7} />
            </button>
            <button
              onClick={() => void send(input)}
              disabled={!input.trim() || streaming}
              aria-label="Send"
              className="w-9 h-9 rounded-lg bg-brand grid place-items-center text-white disabled:opacity-30 hover:bg-[#22303f] transition-colors"
            >
              <ArrowUp size={17} strokeWidth={2} />
            </button>
          </div>
        </div>
        <p className="mt-2.5 text-center text-[11px] text-[#8593a6]">
          GeoAI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}
