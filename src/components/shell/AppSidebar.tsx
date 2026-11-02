import { useState } from 'react';
import {
  SquarePen, Search, Settings, MessageSquare, Trash2, ChevronDown, PanelLeftClose,
} from 'lucide-react';
import { useChatStore, useConversations, type Screen } from '../../stores/chatStore';
import { useUiStore } from '../../stores/uiStore';
import ChatPanel from '../chat/ChatPanel';
import Brand from '../map/Brand';
import { cn } from '../../lib/cn';

/**
 * Left sidebar, present on every screen. Carries only what a chat client
 * carries — new chat, search, conversation history, settings — with the
 * active thread below it.
 */
export default function AppSidebar({ screen }: { screen: Screen }) {
  const conversations = useConversations(screen);
  const activeId = useChatStore((s) => s.activeId[screen]);
  const [filter, setFilter] = useState('');
  const [searching, setSearching] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  const q = filter.trim().toLowerCase();
  const listed = [...conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((c) => !q || c.title.toLowerCase().includes(q));

  return (
    <aside className="w-[352px] shrink-0 h-full flex flex-col bg-canvas border-r border-line min-h-0">
      <div className="px-4 pt-3.5 pb-3 flex items-center justify-between">
        <Brand />
        <button
          onClick={toggleSidebar}
          aria-label="Hide sidebar"
          className="p-1.5 -mr-1 rounded-md text-[#54637a] hover:bg-surfaceAlt hover:text-ink transition-colors"
        >
          <PanelLeftClose size={17} strokeWidth={1.7} />
        </button>
      </div>

      <div className="px-3 pb-2 flex items-center gap-1">
        <button
          onClick={() => useChatStore.getState().newChat(screen)}
          className="flex-1 inline-flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13.5px] font-semibold text-ink hover:bg-surfaceAlt transition-colors"
        >
          <SquarePen size={16} strokeWidth={1.8} /> New chat
        </button>
        <button
          onClick={() => setSearching((v) => !v)}
          aria-label="Search chats"
          aria-pressed={searching}
          className={cn(
            'p-2 rounded-lg transition-colors',
            searching ? 'bg-surfaceAlt text-ink' : 'text-[#54637a] hover:bg-surfaceAlt hover:text-ink',
          )}
        >
          <Search size={16} strokeWidth={1.8} />
        </button>
      </div>

      {searching && (
        <div className="px-3 pb-2">
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search chats"
            className="w-full h-8 rounded-lg bg-white border border-[#dbe3ec] px-2.5 text-[12.5px] outline-none focus:border-[#9fb3ca]"
          />
        </div>
      )}

      <div className="px-3">
        <button
          onClick={() => setHistoryOpen((v) => !v)}
          className="w-full flex items-center gap-1 px-1 py-1 text-[11px] text-[#7b8798] hover:text-ink transition-colors"
        >
          <ChevronDown size={12} className={cn('transition-transform', !historyOpen && '-rotate-90')} />
          Recents
          <span className="ml-auto num">{listed.length}</span>
        </button>

        {historyOpen && (
          <div className="mt-0.5 max-h-[136px] overflow-y-auto scroll-thin flex flex-col gap-px pb-1">
            {listed.map((c) => (
              <div
                key={c.id}
                className={cn(
                  'group flex items-center gap-2 rounded-lg pl-2 pr-1 h-[30px] cursor-pointer transition-colors',
                  c.id === activeId ? 'bg-[#e9eef5] text-ink' : 'text-[#4a5769] hover:bg-surfaceAlt',
                )}
                onClick={() => useChatStore.getState().openChat(c.id)}
              >
                <MessageSquare size={13} strokeWidth={1.7} className="shrink-0 opacity-60" />
                <span className="flex-1 truncate text-[12.5px]">{c.title}</span>
                {listed.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); useChatStore.getState().deleteChat(c.id); }}
                    aria-label={`Delete ${c.title}`}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-[#8593a6] hover:text-danger transition-opacity"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
            {!listed.length && (
              <div className="px-2 py-2 text-[12px] text-[#93a0b1]">No chats match that.</div>
            )}
          </div>
        )}
      </div>

      <div className="mx-3 mt-2 h-px bg-line" />

      <ChatPanel screen={screen} className="flex-1" />

      <div className="px-3 py-2 border-t border-line">
        <button className="w-full inline-flex items-center gap-2.5 h-8 px-2.5 rounded-lg text-[12.5px] text-[#4a5769] hover:bg-surfaceAlt hover:text-ink transition-colors">
          <Settings size={15} strokeWidth={1.7} /> Settings
        </button>
      </div>
    </aside>
  );
}
