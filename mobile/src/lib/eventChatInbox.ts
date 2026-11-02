import type { EventCommunityCursor, EventCommunityMessage, JoinedEventChat } from './eventCommunity';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function cursor(value: unknown): EventCommunityCursor | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as EventCommunityCursor;
  return UUID.test(item.id) && typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt))
    ? { id: item.id, createdAt: new Date(item.createdAt).toISOString() } : null;
}
function key(ownerId: string, eventKey: string) {
  return UUID.test(ownerId) && /^(curated:[0-9a-f-]{36}|(?:ticketmaster|predicthq):[A-Za-z0-9_-]{1,160})$/.test(eventKey)
    ? `l2t-event-chat-read-v1:${ownerId}:${encodeURIComponent(eventKey)}` : null;
}
export function compareEventChatCursors(first: EventCommunityCursor, second: EventCommunityCursor) {
  return Date.parse(first.createdAt) - Date.parse(second.createdAt) || first.id.localeCompare(second.id);
}
export function readEventChatMarker(ownerId: string, eventKey: string): EventCommunityCursor | null {
  const storageKey = key(ownerId, eventKey);
  if (!storageKey) return null;
  try { return cursor(JSON.parse(window.localStorage.getItem(storageKey) || 'null')); } catch { return null; }
}
/** Store only the last actually displayed message cursor, never message text. */
export function markEventChatRead(ownerId: string, eventKey: string, value: EventCommunityCursor): boolean {
  const storageKey = key(ownerId, eventKey), next = cursor(value);
  if (!storageKey || !next) return false;
  try {
    const raw = window.localStorage.getItem(storageKey);
    const previous = raw ? cursor(JSON.parse(raw)) : null;
    if (previous && compareEventChatCursors(previous, next) >= 0) return true;
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    window.dispatchEvent?.(new Event('l2t:event-chat-read'));
    return true;
  } catch { return false; }
}
export function eventChatHasUnread(item: JoinedEventChat, ownerId: string): boolean {
  const incoming = cursor(item.latestIncoming);
  if (!incoming || item.summaryStatus !== 'available') return false;
  const marker = readEventChatMarker(ownerId, item.eventKey);
  return marker ? compareEventChatCursors(incoming, marker) > 0 : Date.parse(incoming.createdAt) >= Date.parse(item.joinedAt);
}
export function latestVisibleChatMessage(messages: EventCommunityMessage[]) {
  return messages.reduce<EventCommunityMessage | null>((latest, message) => {
    const next = cursor(message);
    return next && (!latest || compareEventChatCursors(next, latest) > 0) ? message : latest;
  }, null);
}
