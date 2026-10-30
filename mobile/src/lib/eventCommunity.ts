import { requestJson } from './api';

export type EventCommunityPerson = { key: string; userId: string; username: string; avatarUrl: string | null };
export type EventCommunityEvent = { id: string; title: string; startsAt: string; timeZone: string | null; timePrecision: 'exact' | 'date'; city: string; venue: string; countryCode: string; status: string; sourceUrl: string };
export type EventCommunityMessage = { id: string; body: string; createdAt: string; author: EventCommunityPerson };
export type EventCommunityCursor = { createdAt: string; id: string };
export type EventCommunityMeetup = { id: string; startsAt: string; publicPlace: string; updatedAt: string; creator: EventCommunityPerson; isOwn: boolean; joined: boolean; attendeeCount: number; attendees: EventCommunityPerson[] };
export type EventCommunityState = { eventKey: string; event: EventCommunityEvent; checkedAt: string; version: number; change: null | { previous: EventCommunityEvent; changedAt: string }; joined: boolean; muted: boolean; memberCount: number; attendees: EventCommunityPerson[]; messages: EventCommunityMessage[]; nextBefore: EventCommunityCursor | null; meetup: EventCommunityMeetup | null };
export type JoinedEventChat = { eventKey: string; event: EventCommunityEvent; muted: boolean; joinedAt: string; memberCount: number };
export type EventCommunityAction = { action: 'join' | 'leave' } | { action: 'mute'; muted: boolean } | { action: 'message'; body: string; requestId: string } | { action: 'meetup'; startsAt: string; publicPlace: string } | { action: 'meetup-join' | 'meetup-leave' | 'meetup-delete'; meetupId: string } | { action: 'block'; targetType: 'message' | 'meetup'; targetId: string } | { action: 'report'; targetType: 'message' | 'meetup'; targetId: string; reason: string; note: string };

const headers = (token: string) => ({ Authorization: `Bearer ${token}` });
export function getEventCommunity(eventId: string, token: string, signal?: AbortSignal, cursor?: EventCommunityCursor) {
  const query = new URLSearchParams({ eventId });
  if (cursor) { query.set('before', cursor.createdAt); query.set('beforeId', cursor.id); }
  return requestJson<{ data: EventCommunityState; verification: 'current' | 'unavailable' }>(`/api/event-community?${query}`, { headers: headers(token), signal, timeoutMs: 15_000 });
}
export function listJoinedEventChats(token: string, signal?: AbortSignal) {
  return requestJson<{ data: JoinedEventChat[] }>('/api/event-community', { headers: headers(token), signal, timeoutMs: 12_000 });
}
export async function actOnEventCommunity(eventId: string, token: string, action: EventCommunityAction, signal?: AbortSignal) {
  const result = await requestJson<{ success: boolean; id?: string; userId?: string }>('/api/event-community', { method: 'POST', headers: headers(token), body: { eventId, ...action }, signal, timeoutMs: 15_000 });
  if (result.success !== true) throw new Error('event_community_action_failed');
  window.dispatchEvent(new Event('l2t:event-community-changed'));
  return result;
}
