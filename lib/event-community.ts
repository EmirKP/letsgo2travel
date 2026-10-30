import type { SupabaseClient } from '@supabase/supabase-js';
import { COMMUNITY_UUID, COMMUNITY_REPORT_REASONS } from './community/safety';
import { signedCommunityAvatars } from './community/profiles';
import { validTimeZone, zonedParts } from './zoned-time';

type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const safeText = (value: unknown, max: number, min = 1): value is string => typeof value === 'string'
  && [...value.trim()].length >= min && [...value.trim()].length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const https = (value: unknown) => {
  try { const url = new URL(text(value, 1200)); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
};

export function canonicalEventKey(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  if (COMMUNITY_UUID.test(input)) return `curated:${input.toLowerCase()}`;
  if (/^curated:/.test(input) && COMMUNITY_UUID.test(input.slice(8))) return input.toLowerCase();
  return /^(ticketmaster|predicthq):[A-Za-z0-9_-]{1,160}$/.test(input) ? input : null;
}

export type EventCommunitySnapshot = { id: string; title: string; startsAt: string; timeZone: string | null; timePrecision: 'date' | 'exact'; city: string; venue: string; countryCode: string; status: string; sourceUrl: string };

/** Only server-owned rows or a provider's ID endpoint can supply event facts.
 * The client supplies an ID, never the snapshot or an arbitrary fetch URL. */
export async function resolveCommunityEvent(db: SupabaseClient, key: string): Promise<EventCommunitySnapshot | null> {
  const [provider, id] = key.split(':');
  if (provider === 'curated') {
    const { data, error } = await db.from('travel_events').select('id,title,starts_at,city,venue,country_code,status,source_url').eq('id', id).eq('published', true).maybeSingle();
    if (error) throw new Error('event_source_unavailable');
    return data ? { id, title: text(data.title, 240), startsAt: String(data.starts_at), timeZone: null, timePrecision: 'exact', city: text(data.city, 120), venue: text(data.venue, 180), countryCode: text(data.country_code, 3), status: String(data.status), sourceUrl: https(data.source_url) } : null;
  }
  let payload: Row;
  if (provider === 'ticketmaster') {
    const apiKey = process.env.TICKETMASTER_API_KEY?.trim();
    if (!apiKey) throw new Error('event_source_not_configured');
    const response = await fetch(`https://app.ticketmaster.com/discovery/v2/events/${encodeURIComponent(id)}.json?${new URLSearchParams({ apikey: apiKey })}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000), next: { revalidate: 900 } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('event_source_unavailable');
    payload = row(await response.json());
    if (payload.id !== id) return null;
    const dates = row(payload.dates), start = row(dates.start), status = row(dates.status);
    if (start.dateTBD || start.dateTBA) return null;
    const instant = date(start.dateTime), day = text(start.localDate, 10), exact = Boolean(instant && !start.timeTBA && !start.noSpecificTime);
    const embedded = row(payload._embedded), venue = row(Array.isArray(embedded.venues) ? embedded.venues[0] : null);
    const startsAt = exact ? instant! : /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
    if (!startsAt || !safeText(payload.name, 240) || !https(payload.url)) return null;
    return { id: key, title: text(payload.name, 240), startsAt, timeZone: validTimeZone(dates.timezone) ? dates.timezone : null, timePrecision: exact ? 'exact' : 'date', city: text(row(venue.city).name, 120), venue: text(venue.name, 180), countryCode: text(row(venue.country).countryCode, 3), status: status.code === 'cancelled' || status.code === 'canceled' ? 'cancelled' : status.code === 'postponed' || status.code === 'rescheduled' ? 'postponed' : 'scheduled', sourceUrl: https(payload.url) };
  }
  const accessToken = process.env.PREDICTHQ_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new Error('event_source_not_configured');
  const response = await fetch(`https://api.predicthq.com/v1/events/?${new URLSearchParams({ id, limit: '1', 'state': 'active,deleted,predicted' })}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(6000), next: { revalidate: 900 } });
  if (!response.ok) throw new Error('event_source_unavailable');
  const result = row(await response.json());
  payload = row(Array.isArray(result.results) ? result.results.find(item => row(item).id === id) : null);
  if (payload.id !== id) return null;
  const instant = date(payload.start), timeZone = validTimeZone(payload.timezone) ? payload.timezone : null;
  if (!instant || !safeText(payload.title, 240)) return null;
  const local = timeZone ? zonedParts(Date.parse(instant), timeZone) : { date: text(payload.start_local || payload.start, 40).slice(0, 10), time: '00:00:00' };
  const exact = Boolean(timeZone && payload.state !== 'predicted' && local.time !== '00:00:00');
  const entities = Array.isArray(payload.entities) ? payload.entities.map(row) : [];
  const venue = entities.find(item => item.type === 'venue');
  const city = text(row(row(payload.geo).address).locality || entities.find(item => item.type === 'locality' || item.type === 'city')?.name, 120);
  const sourceUrl = https(payload.url) || `https://www.google.com/search?${new URLSearchParams({ q: `${text(payload.title, 240)} ${city} ${local.date} event` })}`;
  return { id: key, title: text(payload.title, 240), startsAt: exact ? instant : local.date, timeZone, timePrecision: exact ? 'exact' : 'date', city, venue: text(venue?.name, 180), countryCode: text(payload.country, 3), status: payload.cancelled || payload.deleted_reason === 'cancelled' ? 'cancelled' : payload.postponed || payload.deleted_reason === 'postponed' ? 'postponed' : payload.state === 'deleted' ? 'completed' : 'scheduled', sourceUrl };
}

export function parseEventCommunityAction(input: Row): { action: string; input: Row } | null {
  const action = input.action;
  if (action === 'join' || action === 'leave') return { action, input: {} };
  if (action === 'mute' && typeof input.muted === 'boolean') return { action, input: { muted: input.muted } };
  if (action === 'message' && safeText(input.body, 1000) && typeof input.requestId === 'string' && COMMUNITY_UUID.test(input.requestId)) return { action, input: { body: input.body.trim(), requestId: input.requestId } };
  if (action === 'meetup' && safeText(input.publicPlace, 180, 5) && date(input.startsAt)) return { action, input: { publicPlace: input.publicPlace.trim(), startsAt: date(input.startsAt) } };
  if (['meetup-join', 'meetup-leave', 'meetup-delete'].includes(String(action)) && typeof input.meetupId === 'string' && COMMUNITY_UUID.test(input.meetupId)) return { action: String(action), input: { meetupId: input.meetupId } };
  if ((action === 'block' || action === 'report') && ['message', 'meetup'].includes(String(input.targetType)) && typeof input.targetId === 'string' && COMMUNITY_UUID.test(input.targetId)) {
    if (action === 'block') return { action, input: { targetType: input.targetType, targetId: input.targetId } };
    if ((COMMUNITY_REPORT_REASONS as readonly unknown[]).includes(input.reason) && (input.note === undefined || safeText(input.note, 1000, 0)) && (input.reason !== 'other' || safeText(input.note, 1000, 5))) return { action, input: { targetType: input.targetType, targetId: input.targetId, reason: input.reason, note: typeof input.note === 'string' ? input.note.trim() : '' } };
  }
  return null;
}

/** Strip all raw avatar paths; signedCommunityAvatars enforces owner ownership. */
export async function serializeEventCommunity(db: SupabaseClient, input: unknown) {
  const data = row(input);
  const meetup = row(data.meetup);
  const people = [...(Array.isArray(data.attendees) ? data.attendees : []), ...(Array.isArray(data.messages) ? data.messages.map(item => row(item).author) : []), ...(Array.isArray(meetup.attendees) ? meetup.attendees : []), meetup.creator].map(row);
  const avatars = await signedCommunityAvatars(db, people.map(person => ({ userId: person.userId, avatarPath: person.avatarPath })));
  const person = (value: unknown) => { const p = row(value); return typeof p.userId === 'string' && COMMUNITY_UUID.test(p.userId) ? { key: `user:${p.userId}`, userId: p.userId, username: text(p.username, 80) || 'Gezgin', avatarUrl: avatars.get(p.userId) || null } : null; };
  const creator = person(meetup.creator);
  return { ...data, attendees: (Array.isArray(data.attendees) ? data.attendees : []).map(person).filter(Boolean), messages: (Array.isArray(data.messages) ? data.messages : []).map(item => { const m = row(item); return { id: text(m.id, 36), body: text(m.body, 1000), createdAt: text(m.createdAt, 50), author: person(m.author) }; }).filter(item => item.author), meetup: creator ? { ...meetup, creator, attendees: (Array.isArray(meetup.attendees) ? meetup.attendees : []).map(person).filter(Boolean) } : null };
}
