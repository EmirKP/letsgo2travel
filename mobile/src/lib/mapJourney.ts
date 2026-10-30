import { translateTuple } from "./locale";
import { translateCopy } from "./locale";
import type { Coordinates, Place } from '../../../lib/travel-assistant/types';
import { NEEDS, TOURING, DISCOVERY, CATEGORY_LABELS, validJourneyPhoto, validJourneyPlaceSource } from '../../../lib/travel-assistant/places';
import type { JourneyPlanResult } from '../../../lib/travel-assistant/journey-plan-types';
import type { JourneyPhoto } from '../../../lib/travel-assistant/journey-types';
import type { SavedRoutePlan } from '../types';
import { createId } from './id';

export type JourneyPace = 'relaxed' | 'balanced' | 'busy';
export type JourneyPlace = Place & Partial<JourneyPhoto> & { group?: string; kind?: string; address?: string | null };
export type JourneyStop = {
  id: string; place: JourneyPlace; day: number; order: number; durationMinutes: number;
  note: string; fixedTime: string | null; priority: 'normal' | 'high'; sourceUrl: string | null;
  /** Optional v1 metadata. Exact text guards edits made by older clients. */
  noteOrigin?: { locale: JourneyPlanning['locale']; text: string };
};
export type JourneyPlanning = Pick<JourneyPlanResult, 'preferences' | 'locale' | 'summary' | 'limitations' | 'fetchedAt' | 'attribution' | 'generatedBy'> & {
  days: Array<{day:number;theme:string;explanation:string}>; edited?:boolean;
};
export type MapJourney = {
  version: 1; id: string; title: string; city: string; center: Coordinates; dayCount: number;
  startDate: string | null; firstDayStartTime?: string | null; pace: JourneyPace; interests: string[]; stops: JourneyStop[];
  accommodation: (Coordinates & { name: string }) | null; budgetNote: string;
  createdAt: string; updatedAt: string; planning?: JourneyPlanning;
};
/** Only real provider legs belong here. Missing legs remain unknown. */
export type JourneyLeg = {
  fromId: string; toId: string; mode: 'walking' | 'cycling' | 'driving';
  durationMinutes: number; sourceUrl: string; fetchedAt: string;
};
export type ScheduleIssue = 'travel-unknown' | 'hours-unknown' | 'closed' | 'reservation-conflict' | 'outside-day';
export type JourneySchedule = {
  stops: Array<{ stopId: string; startMinutes: number; endMinutes: number; travelMinutes: number | null; timing: 'confirmed' | 'provisional'; issues: ScheduleIssue[] }>;
  breaks: Array<{ afterStopId: string; startMinutes: number; durationMinutes: number; kind: 'meal' | 'rest' }>;
  issues: ScheduleIssue[];
};
export const MAX_JOURNEY_STOPS = 120;
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max
  && Array.from(value).every(character => { const code = character.charCodeAt(0); return code >= 32 && code !== 127 || code === 9 || code === 10 || code === 13; });
const finitePoint = (point: unknown): point is Coordinates => Boolean(point && typeof point === 'object'
  && typeof (point as Coordinates).latitude === 'number' && Number.isFinite((point as Coordinates).latitude) && Math.abs((point as Coordinates).latitude) <= 90
  && typeof (point as Coordinates).longitude === 'number' && Number.isFinite((point as Coordinates).longitude) && Math.abs((point as Coordinates).longitude) <= 180);
const iso = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const dayDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const id = (value: unknown): value is string => text(value, 160) && /^[a-zA-Z0-9._:/-]{1,160}$/.test(value);
const categories = new Set([...NEEDS, ...TOURING, ...DISCOVERY]);
const url = (value: unknown): value is string => {
  if (!text(value, 2000)) return false;
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
};
export function timeMinutes(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
export function formatJourneyTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;
}
export function validateJourneyPlace(value: unknown): value is JourneyPlace {
  if (!value || typeof value !== 'object') return false;
  const p = value as JourneyPlace;
  return finitePoint(p) && validJourneyPlaceSource(p.id, p.sourceUrl) && text(p.name, 180)
    && categories.has(p.category)
    && (p.description === null || text(p.description, 500)) && (p.hours === null || text(p.hours, 180))
    && (p.website === null || url(p.website)) && (p.free === null || typeof p.free === 'boolean')
    && (p.accessible === null || typeof p.accessible === 'boolean')
    && (p.representedCountry === null || typeof p.representedCountry === 'string' && /^[A-Z]{2}$/.test(p.representedCountry))
    && iso(p.fetchedAt) && (p.group === undefined || ['food', 'shopping', 'culture', 'nature', 'essentials'].includes(p.group))
    && (p.kind === undefined || text(p.kind, 60)) && (p.address === undefined || p.address === null || text(p.address, 500)) && validJourneyPhoto(p);
}
export function validateMapJourney(value: unknown): value is MapJourney {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const j = value as MapJourney;
  if (j.version !== 1 || !id(j.id) || !text(j.title, 160) || !j.title.trim() || !text(j.city, 160) || !j.city.trim()
    || !finitePoint(j.center) || !Number.isInteger(j.dayCount) || j.dayCount < 1 || j.dayCount > 14
    || !(j.firstDayStartTime == null || typeof j.firstDayStartTime === 'string' && timeMinutes(j.firstDayStartTime) !== null && timeMinutes(j.firstDayStartTime)! <= 22 * 60)
    || !(j.startDate === null || dayDate(j.startDate)) || !['relaxed', 'balanced', 'busy'].includes(j.pace)
    || !Array.isArray(j.interests) || j.interests.length > 12 || j.interests.some(i => !text(i, 80))
    || !Array.isArray(j.stops) || j.stops.length > MAX_JOURNEY_STOPS || !iso(j.createdAt) || !iso(j.updatedAt)
    || !text(j.budgetNote, 280) || !(j.accommodation === null || finitePoint(j.accommodation) && text(j.accommodation.name, 160))) return false;
  if (j.planning !== undefined && !validateJourneyPlanning(j.planning, j.dayCount)) return false;
  const stopIds = new Set<string>(), placeIds = new Set<string>();
  for (const stop of j.stops) {
    if (!stop || !id(stop.id) || stopIds.has(stop.id) || !validateJourneyPlace(stop.place) || placeIds.has(stop.place.id)
      || !Number.isInteger(stop.day) || stop.day < 1 || stop.day > j.dayCount || !Number.isInteger(stop.order) || stop.order < 0
      || !Number.isInteger(stop.durationMinutes) || stop.durationMinutes < 5 || stop.durationMinutes > 720
      || !text(stop.note, 500) || !(stop.fixedTime === null || typeof stop.fixedTime === 'string' && timeMinutes(stop.fixedTime) !== null)
      || !['normal', 'high'].includes(stop.priority) || !(stop.sourceUrl === null || url(stop.sourceUrl))) return false;
    stopIds.add(stop.id); placeIds.add(stop.place.id);
  }
  for (let day = 1; day <= j.dayCount; day++) {
    if (journeyDayStops(j, day).some((stop, index) => stop.order !== index)) return false;
  }
  try { return JSON.stringify(j).length <= 300_000; } catch { return false; }
}
export function validateJourneyPlanning(value: unknown, dayCount:number): value is JourneyPlanning {
  if (!value || typeof value !== 'object') return false;
  const p=value as JourneyPlanning, prefs=p.preferences;
  return p.generatedBy==='ai' && ['tr','en','sq', 'ro'].includes(p.locale) && iso(p.fetchedAt)
    && text(p.summary,1600) && Boolean(p.summary.trim()) && text(p.attribution,240)
    && (p.edited===undefined||typeof p.edited==='boolean')
    && Boolean(prefs) && ['solo','couple','friends','family'].includes(prefs.party)
    && ['economical','moderate','comfortable'].includes(prefs.budget)
    && ['relaxed','balanced','busy'].includes(prefs.pace) && ['light','standard'].includes(prefs.walking)
    && text(prefs.notes,1000) && Array.isArray(prefs.interests) && prefs.interests.length>=1 && prefs.interests.length<=4
    && new Set(prefs.interests).size===prefs.interests.length && prefs.interests.every(item=>['city','culture','food','shopping','nature','sea','adventure'].includes(item))
    && Array.isArray(p.limitations) && p.limitations.length<=8 && p.limitations.every(item=>text(item,500))
    && Array.isArray(p.days) && p.days.length===dayCount && p.days.every((day,index)=>day&&day.day===index+1&&text(day.theme,120)&&text(day.explanation,800));
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type StoredJourneyDetails = {
  version: 1;
  places: Array<{ stopId: string; placeId: string; category: 'beach' | 'hiking' | 'bank' | 'transit'; fallback: 'attraction' }>;
  interests?: { selected: JourneyPlanning['preferences']['interests']; fallback: JourneyPlanning['preferences']['interests'] };
};
const legacyInterests = (interests: JourneyPlanning['preferences']['interests']) => [...new Set(interests.map(interest => interest === 'city' ? 'culture' : interest === 'sea' || interest === 'adventure' ? 'nature' : interest))];
const sameInterests = (left: string[], right: string[]) => left.length === right.length && left.every((item, index) => item === right[index]);
function validStoredDetails(value: unknown): value is StoredJourneyDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const details = value as StoredJourneyDetails;
  if (details.version !== 1 || !Array.isArray(details.places) || details.places.length > MAX_JOURNEY_STOPS
    || new Set(details.places.map(place => place?.stopId)).size !== details.places.length
    || details.places.some(place => !place || !id(place.stopId) || !id(place.placeId) || place.fallback !== 'attraction' || !['beach', 'hiking', 'bank', 'transit'].includes(place.category))) return false;
  if (details.interests !== undefined) {
    const { selected, fallback } = details.interests || {};
    if (!Array.isArray(selected) || selected.length < 1 || selected.length > 4 || new Set(selected).size !== selected.length
      || selected.some(interest => !['city', 'culture', 'food', 'shopping', 'nature', 'sea', 'adventure'].includes(interest))
      || !Array.isArray(fallback) || !sameInterests(legacyInterests(selected), fallback)) return false;
  }
  return true;
}
/** Decode optional detail only against an unchanged, independently valid base document. */
export function decodeStoredMapJourney(value: unknown): MapJourney | null {
  if (!validateMapJourney(value)) return null;
  const journey = copy(value) as MapJourney & { storageDetails?: unknown };
  const details = journey.storageDetails;
  delete journey.storageDetails;
  if (!validStoredDetails(details)) return journey;
  for (const detail of details.places) {
    const stop = journey.stops.find(item => item.id === detail.stopId && item.place.id === detail.placeId);
    // Older versions can remove or replace stops. Metadata must never undo that edit.
    if (stop?.place.category === detail.fallback) stop.place.category = detail.category;
  }
  if (details.interests && journey.planning && sameInterests(journey.planning.preferences.interests, details.interests.fallback)) {
    journey.planning.preferences.interests = [...details.interests.selected];
  }
  return validateMapJourney(journey) ? journey : null;
}
/** Keep v1's validated fields readable by installed clients; exact new values are optional metadata. */
export function encodeStoredMapJourney(value: MapJourney): MapJourney {
  const journey = decodeStoredMapJourney(value);
  if (!journey) throw new Error('invalid');
  const details: StoredJourneyDetails = { version: 1, places: [] };
  for (const stop of journey.stops) {
    if (stop.place.category === 'beach' || stop.place.category === 'hiking' || stop.place.category === 'bank' || stop.place.category === 'transit') {
      details.places.push({ stopId: stop.id, placeId: stop.place.id, category: stop.place.category, fallback: 'attraction' });
      stop.place.category = 'attraction';
    }
  }
  if (journey.planning) {
    const selected = journey.planning.preferences.interests;
    const fallback = legacyInterests(selected);
    if (!sameInterests(selected, fallback)) {
      details.interests = { selected: [...selected], fallback };
      journey.planning.preferences.interests = fallback;
    }
  }
  const stored: MapJourney & { storageDetails?: StoredJourneyDetails } = journey;
  if (details.places.length || details.interests) stored.storageDetails = details;
  return checked(stored);
}
function checked(journey: MapJourney) { if (!validateMapJourney(journey)) throw new Error('invalid'); return journey; }
export function journeyStopNoteLocale(journey: MapJourney, stop: JourneyStop): JourneyPlanning['locale'] | undefined {
  const origin = stop.noteOrigin;
  if (origin !== undefined) return origin && ['tr', 'en', 'sq', 'ro'].includes(origin.locale) && origin.text === stop.note ? origin.locale : undefined;
  return journey.planning && !journey.planning.edited ? journey.planning.locale : undefined;
}
function changed(journey: MapJourney, stops: JourneyStop[]): MapJourney {
  const originals = new Map(journey.stops.map(stop => [stop.id, stop]));
  const nextStops = stops.map(stop => {
    const original = originals.get(stop.id);
    const locale = original?.note === stop.note ? journeyStopNoteLocale(journey, original) : undefined;
    const next = { ...stop };
    delete next.noteOrigin;
    if (locale && stop.note) next.noteOrigin = { locale, text: stop.note };
    return next;
  });
  const result = { ...journey, stops: nextStops, ...(journey.planning ? {planning:{...journey.planning,edited:true}} : {}), updatedAt: new Date().toISOString() };
  for (let day = 1; day <= journey.dayCount; day++) journeyDayStops(result, day).forEach((stop, order) => { stop.order = order; });
  return checked(result);
}
export function createMapJourney(options: {
  city: string; center: Coordinates; dayCount: number; pace?: JourneyPace; interests?: string[];
  startDate?: string | null; firstDayStartTime?: string | null; title?: string; accommodation?: MapJourney['accommodation']; budgetNote?: string;
}): MapJourney {
  const now = new Date().toISOString();
  return checked({ version: 1, id: `journey-${createId()}`, title: options.title?.trim() || options.city.trim(), city: options.city.trim(),
    center: copy(options.center), dayCount: options.dayCount, startDate: options.startDate || null, pace: options.pace || 'balanced',
    ...(options.firstDayStartTime ? { firstDayStartTime: options.firstDayStartTime } : {}),
    interests: [...(options.interests || [])], accommodation: copy(options.accommodation || null), budgetNote: options.budgetNote || '',
    stops: [], createdAt: now, updatedAt: now });
}
export function journeyDayStops(journey: MapJourney, day: number): JourneyStop[] {
  return journey.stops.filter(stop => stop.day === day).sort((a, b) => a.order - b.order);
}
export type JourneyStopOptions = Partial<Pick<JourneyStop, 'durationMinutes' | 'note' | 'fixedTime' | 'priority' | 'sourceUrl'>>;
export function addJourneyStop(journey: MapJourney, place: JourneyPlace, day: number, options: JourneyStopOptions = {}): MapJourney {
  checked(journey);
  if (!validateJourneyPlace(place) || !Number.isInteger(day) || day < 1 || day > journey.dayCount) throw new Error('invalid');
  if (journey.stops.some(stop => stop.place.id === place.id)) return journey;
  if (journey.stops.length >= MAX_JOURNEY_STOPS) throw new Error('full');
  const stop: JourneyStop = { id: `stop-${createId()}`, place: copy(place), day, order: journeyDayStops(journey, day).length,
    durationMinutes: 60, note: '', fixedTime: null, priority: 'normal', sourceUrl: null, ...options };
  return changed(journey, [...copy(journey.stops), stop]);
}
export function removeJourneyStop(journey: MapJourney, stopId: string): MapJourney {
  checked(journey);
  return journey.stops.some(stop => stop.id === stopId) ? changed(journey, copy(journey.stops.filter(stop => stop.id !== stopId))) : journey;
}
export function updateJourneyStop(journey: MapJourney, stopId: string, patch: JourneyStopOptions): MapJourney {
  checked(journey);
  if (!journey.stops.some(stop => stop.id === stopId)) throw new Error('missing');
  return changed(journey, journey.stops.map(stop => stop.id === stopId ? { ...copy(stop), ...patch } : copy(stop)));
}
export function moveJourneyStop(journey: MapJourney, stopId: string, day: number, index?: number): MapJourney {
  checked(journey);
  const moving = journey.stops.find(stop => stop.id === stopId);
  if (!moving) throw new Error('missing');
  if (!Number.isInteger(day) || day < 1 || day > journey.dayCount) throw new Error('invalid');
  const target = journeyDayStops(journey, day).filter(stop => stop.id !== stopId).map(copy);
  const position = index ?? target.length;
  if (!Number.isInteger(position) || position < 0 || position > target.length) throw new Error('invalid');
  target.splice(position, 0, { ...copy(moving), day });
  target.forEach((stop, order) => { stop.order = order; });
  return changed(journey, [...journey.stops.filter(stop => stop.day !== day && stop.id !== stopId).map(copy), ...target]);
}
export function reorderJourneyStop(journey: MapJourney, stopId: string, direction: -1 | 1) {
  const stop = journey.stops.find(item => item.id === stopId);
  if (!stop || ![-1, 1].includes(direction)) throw new Error('missing');
  const target = stop.order + direction;
  return target < 0 || target >= journeyDayStops(journey, stop.day).length ? journey : moveJourneyStop(journey, stopId, stop.day, target);
}
function distance(a: Coordinates, b: Coordinates) {
  // Great-circle proximity is only an ordering heuristic. It is never exposed
  // as walking distance or converted to an invented travel time.
  const radians = Math.PI / 180;
  const latitude = (a.latitude - b.latitude) * radians;
  const longitude = (a.longitude - b.longitude) * radians;
  return Math.sin(latitude / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(longitude / 2) ** 2;
}
function duration(from: JourneyStop, to: JourneyStop, legs: JourneyLeg[]): number | null {
  const found = legs.find(leg => (leg.fromId === from.id || leg.fromId === from.place.id) && (leg.toId === to.id || leg.toId === to.place.id) && leg.mode === 'walking'
    && Number.isFinite(leg.durationMinutes) && leg.durationMinutes >= 0 && leg.durationMinutes <= 1440
    && url(leg.sourceUrl) && iso(leg.fetchedAt) && Math.abs(Date.now() - Date.parse(leg.fetchedAt)) < 24 * 60 * 60 * 1000);
  return found ? Math.ceil(found.durationMinutes) : null;
}
/** Optimises only unfixed, ordinary-priority segments. Fixed reservations and priority anchors never move. */
export function optimizeJourney(journey: MapJourney, day?: number, legs: JourneyLeg[] = []): MapJourney {
  checked(journey);
  if (day !== undefined && (!Number.isInteger(day) || day < 1 || day > journey.dayCount)) throw new Error('invalid');
  const stops = copy(journey.stops);
  for (let d = 1; d <= journey.dayCount; d++) {
    if (day !== undefined && day !== d) continue;
    const ordered = journeyDayStops(journey, d);
    let start = 0;
    while (start < ordered.length) {
      if (ordered[start].fixedTime || ordered[start].priority === 'high') { start++; continue; }
      let end = start;
      while (end < ordered.length && !ordered[end].fixedTime && ordered[end].priority !== 'high') end++;
      const pool = ordered.slice(start, end);
      let previous = start ? ordered[start - 1] : null;
      for (let index = start; index < end; index++) {
        // Use travel time only when all candidates have comparable real legs;
        // otherwise geographic proximity is a heuristic, never a route claim.
        const allReal = previous && pool.every(stop => duration(previous!, stop, legs) !== null);
        pool.sort((a, b) => allReal ? duration(previous!, a, legs)! - duration(previous!, b, legs)!
          : distance(previous?.place || journey.accommodation || journey.center, a.place) - distance(previous?.place || journey.accommodation || journey.center, b.place));
        const next = pool.shift()!;
        stops.find(stop => stop.id === next.id)!.order = index;
        ordered[index] = next; previous = next;
      }
      start = end;
    }
  }
  let candidate = changed(journey, stops);
  const conflictCount = (schedule: JourneySchedule) => schedule.stops.reduce((total, stop) => total + stop.issues.filter(issue => ['closed', 'reservation-conflict', 'outside-day'].includes(issue)).length, 0);
  for (let d = 1; d <= journey.dayCount; d++) {
    if (day !== undefined && day !== d) continue;
    // A nearer sequence is not an improvement when it breaks known hours or
    // an appointment that the original programme could accommodate.
    if (conflictCount(scheduleJourneyDay(candidate, d, legs)) > conflictCount(scheduleJourneyDay(journey, d, legs))) {
      candidate = changed(candidate, candidate.stops.map(stop => stop.day === d ? copy(journey.stops.find(original => original.id === stop.id)!) : copy(stop)));
    }
  }
  return candidate;
}
/** New places are assigned in nearby geographic groups; existing stops and reservations keep their days. */
export function generateJourneyDays(journey: MapJourney, places: JourneyPlace[], legs: JourneyLeg[] = []): MapJourney {
  checked(journey);
  let next = journey;
  const pool = [...places];
  let previous: Coordinates = journey.accommodation || journey.center;
  const fresh: JourneyPlace[] = [];
  const seen = new Set(journey.stops.map(stop => stop.place.id));
  while (pool.length) {
    pool.sort((a, b) => distance(previous, a) - distance(previous, b));
    const place = pool.shift()!;
    if (!validateJourneyPlace(place)) throw new Error('invalid');
    if (seen.has(place.id)) continue;
    fresh.push(place); seen.add(place.id); previous = place;
  }
  const perDay = Math.max(1, Math.ceil(fresh.length / journey.dayCount));
  fresh.forEach((place, index) => {
    const preferredDay = Math.min(journey.dayCount, Math.floor(index / perDay) + 1);
    const candidates = Array.from({ length: journey.dayCount }, (_, offset) => {
      const day = offset + 1;
      const candidate = addJourneyStop(next, place, day, { durationMinutes: journey.pace === 'relaxed' ? 75 : journey.pace === 'busy' ? 40 : 60 });
      const schedule = scheduleJourneyDay(candidate, day, legs);
      const existing = scheduleJourneyDay(next, day, legs);
      const severity = (value: JourneySchedule) => value.stops.reduce((total, stop) => total
        + (stop.issues.includes('closed') ? 100 : 0) + (stop.issues.includes('reservation-conflict') ? 100 : 0)
        + (stop.issues.includes('outside-day') ? 50 : 0), 0);
      // Keep geographic groups unless actual opening hours, known travel or
      // visit/break durations make another day measurably more feasible.
      return { candidate, score: (severity(schedule) - severity(existing)) * 100 + Math.abs(day - preferredDay) };
    });
    candidates.sort((a, b) => a.score - b.score);
    next = candidates[0].candidate;
  });
  return optimizeJourney(next, undefined, legs);
}

/** Conservative subset of OSM hours. Complex/public-holiday expressions stay unknown. */
function openingWindows(hours: string | null, date: string | null): Array<[number, number]> | null {
  if (hours === '24/7') return [[0, 1440]];
  if (!hours || !date) return null;
  const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const windows: Array<[number, number]> = [];
  let matchedRules = 0;
  for (const rule of hours.split(';')) {
    const match = /^\s*(?:(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?\s+)?(off|closed|\d{2}:\d{2}-\d{2}:\d{2}(?:,\d{2}:\d{2}-\d{2}:\d{2})*)\s*$/.exec(rule);
    if (!match) return null;
    const start = match[1] ? weekdays.indexOf(match[1]) : 0;
    const end = match[2] ? weekdays.indexOf(match[2]) : match[1] ? start : 6;
    const matches = start <= end ? weekday >= start && weekday <= end : weekday >= start || weekday <= end;
    if (matches) matchedRules++;
    // Parse every rule before deciding. A later holiday/conditional expression
    // must not be hidden by an earlier `off`, and overlapping rule precedence
    // stays explicitly unknown without a complete opening_hours interpreter.
    if (match[3] === 'off' || match[3] === 'closed') continue;
    for (const period of match[3].split(',')) {
      const [left, right] = period.split('-');
      const open = timeMinutes(left), close = right === '24:00' ? 1440 : timeMinutes(right);
      if (open === null || close === null || close <= open) return null;
      if (matches) windows.push([open, close]);
    }
  }
  return matchedRules > 1 ? null : windows.sort((a, b) => a[0] - b[0]);
}
export function scheduleJourneyDay(journey: MapJourney, day: number, legs: JourneyLeg[] = []): JourneySchedule {
  checked(journey);
  if (!Number.isInteger(day) || day < 1 || day > journey.dayCount) throw new Error('invalid');
  const ordered = journeyDayStops(journey, day), result: JourneySchedule = { stops: [], breaks: [], issues: [] };
  const startsAt = day === 1 && journey.firstDayStartTime ? timeMinutes(journey.firstDayStartTime)! : 9 * 60;
  let clock = startsAt, lowerBound = clock, uncertain = false, meal = startsAt >= 15 * 60, activeVisits = 0;
  const normalEnd = journey.pace === 'relaxed' ? 17 * 60 : journey.pace === 'busy' ? 21 * 60 : 19 * 60;
  const end = Math.min(24 * 60, Math.max(normalEnd, startsAt + 2 * 60));
  const date = journey.startDate ? new Date(Date.parse(journey.startDate) + (day - 1) * 86400000).toISOString().slice(0, 10) : null;
  ordered.forEach((stop, index) => {
    const issues: ScheduleIssue[] = [];
    const travelMinutes = index ? duration(ordered[index - 1], stop, legs) : 0;
    if (travelMinutes === null) { uncertain = true; issues.push('travel-unknown'); }
    else { clock += travelMinutes; lowerBound += travelMinutes; }
    const fixed = stop.fixedTime === null ? null : timeMinutes(stop.fixedTime);
    if (fixed !== null) {
      if (lowerBound > fixed) issues.push('reservation-conflict');
      clock = fixed;
    }
    const windows = openingWindows(stop.place.hours, date);
    if (windows === null) issues.push('hours-unknown');
    else if (fixed !== null) {
      if (!windows.some(([open, close]) => fixed >= open && fixed + stop.durationMinutes <= close)) issues.push('closed');
    } else {
      const available = windows.find(([open, close]) => Math.max(open, clock) + stop.durationMinutes <= close);
      if (available) clock = Math.max(clock, available[0]);
      else issues.push('closed');
    }
    const startMinutes = clock, endMinutes = clock + stop.durationMinutes;
    if (startMinutes < startsAt || endMinutes > end) issues.push('outside-day');
    result.stops.push({ stopId: stop.id, startMinutes, endMinutes, travelMinutes, timing: uncertain ? 'provisional' : 'confirmed', issues });
    // A conflict never makes the next reservation look reachable by travelling back in time.
    lowerBound = Math.max(lowerBound, startMinutes) + stop.durationMinutes;
    clock = Math.max(endMinutes, lowerBound);
    // A restaurant visit already includes the meal; a seated cafe/food visit
    // also provides rest. Do not charge a second break before or after it.
    const foodVisit = stop.place.group === 'food' || ['restaurant', 'cafe', 'bakery', 'sweets'].includes(stop.place.category);
    const mealVisit = stop.place.category === 'restaurant' && stop.durationMinutes >= 30 && endMinutes >= 11 * 60;
    const next = ordered[index + 1];
    const nextIsFood = next && (next.place.group === 'food' || ['restaurant', 'cafe', 'bakery', 'sweets'].includes(next.place.category));
    if (mealVisit) meal = true;
    activeVisits = foodVisit && stop.durationMinutes >= 15 ? 0 : activeVisits + 1;
    if (next && !foodVisit && !nextIsFood && (!meal && clock >= 12 * 60 || activeVisits >= 2)) {
      const kind = !meal && clock >= 12 * 60 ? 'meal' : 'rest';
      const durationMinutes = kind === 'meal' ? 45 : journey.pace === 'relaxed' ? 20 : journey.pace === 'busy' ? 10 : 15;
      result.breaks.push({ afterStopId: stop.id, startMinutes: clock, durationMinutes, kind });
      clock += durationMinutes; lowerBound += durationMinutes;
      if (kind === 'meal') meal = true;
      activeVisits = 0;
    }
  });
  result.issues = [...new Set(result.stops.flatMap(stop => stop.issues))];
  return result;
}
export function mapJourneyFromSavedRoute(saved: SavedRoutePlan): MapJourney | null {
  const journey = saved.plan?.routes?.find(route => route.mapJourney)?.mapJourney;
  return decodeStoredMapJourney(journey);
}
export function mapJourneyToSavedRoute(journey: MapJourney, locale: 'tr' | 'en' | 'sq' | 'ro' = 'tr', previous?: SavedRoutePlan): SavedRoutePlan {
  checked(journey);
  const label = (tr: string, en: string, sq: string) => translateCopy(locale, tr, en, sq);
  const dailyPlan = Array.from({ length: journey.dayCount }, (_, index) => {
    const stops = journeyDayStops(journey, index + 1);
    return `${label(`${index + 1}. Gün`, `Day ${index + 1}`, `Dita ${index + 1}`)}: ${stops.length ? stops.map(stop => `${stop.fixedTime ? `${stop.fixedTime} ` : ''}${stop.place.name || translateTuple(locale, CATEGORY_LABELS[stop.place.category])}`).join(' → ') : label('Serbest zaman', 'Free time', 'Kohë e lirë')}`.slice(0, 590);
  });
  return { id: journey.id, createdAt: previous?.createdAt || journey.createdAt,
    input: previous?.input || { origin: '', days: String(journey.dayCount), dayCount: journey.dayCount, month: journey.startDate?.slice(0, 7) || '',
      budget: journey.planning?.preferences.budget || journey.budgetNote, accommodation: journey.accommodation?.name || '', who: journey.planning?.preferences.party || '', tempo: journey.pace, vibe: journey.interests, visa: '', mode: 'fixed' },
    plan: { summary: journey.planning?.summary || journey.title, routes: [{ name: journey.title, country: '', cityOrRegion: journey.city,
      why: journey.planning&&!journey.planning.edited ? journey.planning.summary : label('Haritada düzenlediğin günlük program.', 'Your editable daily map itinerary.', 'Programi yt ditor i redaktueshëm në hartë.'),
      visaStatus: 'unknown', estimatedBudget: '', idealDuration: `${journey.dayCount} ${label('gün', 'days', 'ditë')}`,
      bestFor: '', difficulty: '', firstTimeFriendly: false, transportEase: '', safetyNote: '', scores: { budget: 0, visaEase: 0, firstTime: 0, transport: 0, overall: 0 },
      dailyPlan, warnings: [], mapJourney: encodeStoredMapJourney(journey) }] } };
}
