import type { JourneyArea } from './mapJourneyClient';

export const JOURNEY_INTERESTS = ['city', 'culture', 'food', 'sea', 'nature', 'adventure', 'shopping'] as const;
export type JourneyInterest = typeof JOURNEY_INTERESTS[number];
export type JourneySurveyDraft = {
  step: number; query: string; area: JourneyArea | null; dayText: string;
  dateMode: 'flexible' | 'specific'; startDate: string; firstDayStartTime: string;
  party: 'solo' | 'couple' | 'friends' | 'family'; budget: 'economical' | 'moderate' | 'comfortable';
  pace: 'relaxed' | 'balanced' | 'busy'; walking: 'light' | 'standard'; interests: JourneyInterest[]; notes: string;
};
const PREFIX = 'l2t.journey-survey.v1:';
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max
  && [...value].every(character => character.charCodeAt(0) >= 32 || character === '\n' || character === '\r' || character === '\t');
const oneOf = (value: unknown, values: readonly string[]) => typeof value === 'string' && values.includes(value);
function key(ownerId: string | null, scope: string) {
  if (ownerId !== null && (!text(ownerId, 160) || !ownerId.trim()) || !text(scope, 160) || !scope.trim()) throw Error('invalid-draft-owner');
  return `${PREFIX}${ownerId === null ? 'guest' : `owner:${encodeURIComponent(ownerId)}`}:${encodeURIComponent(scope)}`;
}
function area(value: unknown): value is JourneyArea | null {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return text(v.name, 260) && !!v.name.trim() && typeof v.latitude === 'number' && Number.isFinite(v.latitude) && Math.abs(v.latitude) <= 90
    && typeof v.longitude === 'number' && Number.isFinite(v.longitude) && Math.abs(v.longitude) <= 180
    && (v.address == null || text(v.address, 260)) && (v.sourceUrl === undefined || text(v.sourceUrl, 2000) && /^https:\/\//.test(v.sourceUrl));
}
function valid(value: unknown): value is JourneySurveyDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const completeTiming = Number(v.step) < 2 || text(v.dayText, 2) && /^\d{1,2}$/.test(v.dayText) && Number(v.dayText) >= 1 && Number(v.dayText) <= 14
    && (v.dateMode === 'flexible' || typeof v.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.startDate)
      && Number.isFinite(Date.parse(`${v.startDate}T12:00:00Z`)) && new Date(`${v.startDate}T12:00:00Z`).toISOString().slice(0, 10) === v.startDate)
    && (v.firstDayStartTime === '' || typeof v.firstDayStartTime === 'string' && /^([01]\d|2[0-2]):[0-5]\d$/.test(v.firstDayStartTime) && v.firstDayStartTime <= '22:00');
  return completeTiming && Number.isInteger(v.step) && Number(v.step) >= 0 && Number(v.step) <= 3 && text(v.query, 260) && area(v.area)
    && (v.step === 0 || v.area !== null) && text(v.dayText, 3) && text(v.startDate, 10) && text(v.firstDayStartTime, 5)
    && oneOf(v.dateMode, ['flexible', 'specific']) && oneOf(v.party, ['solo', 'couple', 'friends', 'family'])
    && oneOf(v.budget, ['economical', 'moderate', 'comfortable']) && oneOf(v.pace, ['relaxed', 'balanced', 'busy'])
    && oneOf(v.walking, ['light', 'standard']) && Array.isArray(v.interests) && v.interests.length <= 4
    && new Set(v.interests).size === v.interests.length && v.interests.every(item => oneOf(item, JOURNEY_INTERESTS)) && text(v.notes, 1000);
}
export function readJourneySurveyDraft(ownerId: string | null, scope = 'new'): { draft: JourneySurveyDraft | null; error: boolean } {
  try {
    const raw = window.localStorage.getItem(key(ownerId, scope));
    if (raw === null) return { draft: null, error: false };
    if (raw.length > 12000) return { draft: null, error: true };
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !valid(value.draft)) return { draft: null, error: true };
    const draft = value.draft as JourneySurveyDraft;
    // Copy only the supported fields; stored extra fields never become generation input.
    return { draft: { step: draft.step, query: draft.query, area: draft.area && { name: draft.area.name, latitude: draft.area.latitude, longitude: draft.area.longitude,
      ...(draft.area.address ? { address: draft.area.address } : {}), ...(draft.area.sourceUrl ? { sourceUrl: draft.area.sourceUrl } : {}) },
    dayText: draft.dayText, dateMode: draft.dateMode, startDate: draft.startDate, firstDayStartTime: draft.firstDayStartTime,
    party: draft.party, budget: draft.budget, pace: draft.pace, walking: draft.walking, interests: [...draft.interests], notes: draft.notes }, error: false };
  } catch { return { draft: null, error: true }; }
}
export function saveJourneySurveyDraft(ownerId: string | null, draft: JourneySurveyDraft, scope = 'new'): boolean {
  try {
    if (!valid(draft) || readJourneySurveyDraft(ownerId, scope).error) return false;
    window.localStorage.setItem(key(ownerId, scope), JSON.stringify({ version: 1, draft }));
    return true;
  } catch { return false; }
}
/** Clear only after a confirmed plan result. Unreadable/future drafts are never silently erased. */
export function clearJourneySurveyDraft(ownerId: string | null, scope = 'new'): boolean {
  try {
    if (readJourneySurveyDraft(ownerId, scope).error) return false;
    window.localStorage.removeItem(key(ownerId, scope));
    return true;
  } catch { return false; }
}
/** Explicit account deletion removes only this owner's drafts, including unreadable data. */
export function clearOwnerJourneySurveyDrafts(ownerId: string): boolean {
  try {
    const prefix = key(ownerId, 'new').slice(0, -3);
    const storage = window.localStorage;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const candidate = storage.key(index);
      if (candidate?.startsWith(prefix)) keys.push(candidate);
    }
    for (const candidate of keys) storage.removeItem(candidate);
    return true;
  } catch { return false; }
}
export function journeyInterestsFromWelcome(values: readonly string[]): JourneyInterest[] {
  const mapping: Record<string, JourneyInterest> = { 'Şehir': 'city', 'Kültür': 'culture', 'Yeme-içme': 'food', 'Deniz': 'sea', 'Doğa': 'nature', 'Macera': 'adventure' };
  return [...new Set(values.flatMap(value => mapping[value] ? [mapping[value]] : []))].slice(0, 4);
}
