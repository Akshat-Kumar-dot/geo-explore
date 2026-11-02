import { useMemo } from 'react';
import { create } from 'zustand';

export type Screen = 'map' | 'plan';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Zone whose detail card renders under this reply. */
  focusZone?: string | null;
  /** Mine whose detail card renders under this reply. */
  focusMine?: string | null;
  /** Human-readable trace of what the reply changed on screen. */
  trace?: string[];
  pending?: boolean;
  /** Answered without the language model. */
  offline?: boolean;
}

export interface Conversation {
  id: string;
  screen: Screen;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface ChatState {
  conversations: Conversation[];
  /** The open conversation per screen, so the two never collide. */
  activeId: Record<Screen, string>;
  streaming: boolean;

  newChat: (screen: Screen) => string;
  openChat: (id: string) => void;
  deleteChat: (id: string) => void;
  push: (screen: Screen, m: Omit<ChatMessage, 'id'>) => string;
  patch: (screen: Screen, id: string, patch: Partial<ChatMessage>) => void;
  setStreaming: (v: boolean) => void;
}

/** Shared empty list: allocating one per snapshot makes useSyncExternalStore loop. */
const NO_MESSAGES: ChatMessage[] = [];

let counter = 0;
const nextId = () => `m${++counter}`;

const GREETING: Record<Screen, string> = {
  map: `I rank the mapped mining ground in India's **iron ore belts** by how likely it is to expose iron ore, and I can drive this map for you.

Try *"show 10"*, *"take me to Noamundi"*, *"show Bailadila"*, *"only zones above 0.85"*, or ask why a target ranks where it does.

The polygons and the GEM iron mines are real. Scores are synthetic until the Stage 2 detector is trained, and nothing here is an Fe grade or tonnage estimate.`,
  plan: `I have a daily production record for ten large iron ore mines across the Singhbhum–Keonjhar, Bailadila and Bellary–Hospet–Sandur belts, and I can drive this screen.

Ask me *"why is the equipment programme in weeks 9–14"*, name a mine, or say *"rainfall at 140%"* to re-run the forecast.

Mine names and capacities are real (GEM); the production records are synthetic.`,
};

const NEW_TITLE: Record<Screen, string> = { map: 'New map chat', plan: 'New plan chat' };

function blank(screen: Screen): Conversation {
  const now = Date.now();
  return {
    id: nextId(),
    screen,
    title: NEW_TITLE[screen],
    messages: [{ id: nextId(), role: 'assistant', content: GREETING[screen] }],
    createdAt: now,
    updatedAt: now,
  };
}

/** First user message becomes the conversation name, as in any chat client. */
const titleFrom = (text: string) => {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > 42 ? `${t.slice(0, 42).trimEnd()}…` : t;
};

const initial = [blank('map'), blank('plan')];

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: initial,
  activeId: { map: initial[0].id, plan: initial[1].id },
  streaming: false,

  newChat: (screen) => {
    const c = blank(screen);
    set((s) => ({
      conversations: [c, ...s.conversations],
      activeId: { ...s.activeId, [screen]: c.id },
    }));
    return c.id;
  },

  openChat: (id) => {
    const c = get().conversations.find((x) => x.id === id);
    if (!c) return;
    set((s) => ({ activeId: { ...s.activeId, [c.screen]: c.id } }));
  },

  deleteChat: (id) => {
    const c = get().conversations.find((x) => x.id === id);
    if (!c) return;
    const rest = get().conversations.filter((x) => x.id !== id);
    const replacement = rest.find((x) => x.screen === c.screen) ?? blank(c.screen);
    set({
      conversations: rest.includes(replacement) ? rest : [replacement, ...rest],
      activeId: { ...get().activeId, [c.screen]: replacement.id },
    });
  },

  push: (screen, m) => {
    const id = nextId();
    set((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== s.activeId[screen]) return c;
        const isFirstUser = m.role === 'user' && !c.messages.some((x) => x.role === 'user');
        return {
          ...c,
          title: isFirstUser ? titleFrom(m.content) : c.title,
          messages: [...c.messages, { ...m, id }],
          updatedAt: Date.now(),
        };
      }),
    }));
    return id;
  },

  patch: (screen, id, patch) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id !== s.activeId[screen]
          ? c
          : { ...c, messages: c.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) },
      ),
    })),

  setStreaming: (streaming) => set({ streaming }),
}));

/** Stable per-screen message list for components. */
export const useMessages = (screen: Screen) =>
  useChatStore((s) => s.conversations.find((c) => c.id === s.activeId[screen])?.messages ?? NO_MESSAGES);

/** Memoised: a filtered array must not be built inside the store selector. */
export const useConversations = (screen: Screen): Conversation[] => {
  const conversations = useChatStore((s) => s.conversations);
  return useMemo(() => conversations.filter((c) => c.screen === screen), [conversations, screen]);
};
