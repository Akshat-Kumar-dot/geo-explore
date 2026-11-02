import { useMapStore } from '../stores/mapStore';
import { useChatStore } from '../stores/chatStore';
import { zoneNarrative } from '../components/chat/localAnswers';

/**
 * Writes a zone's explanation and detail card into the map chat.
 * Selecting a zone only highlights it; this is the deliberate "tell me about
 * it" step, reached by double-tapping the zone, pressing Enter, or asking.
 */
export function explainZoneInChat(zoneId: string) {
  const zone = useMapStore.getState().zones.find((z) => z.zone_id === zoneId);
  if (!zone) return;

  const chat = useChatStore.getState();
  const messages = chat.conversations.find((c) => c.id === chat.activeId.map)?.messages ?? [];
  const last = messages[messages.length - 1];
  // Double-tapping the same zone twice should not stack identical cards.
  if (last?.role === 'assistant' && last.focusZone === zoneId) return;

  chat.push('map', {
    role: 'assistant',
    content: zoneNarrative(zone),
    focusZone: zone.zone_id,
  });
}
