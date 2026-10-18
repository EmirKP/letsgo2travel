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
const SIGN_IN_KEY = 'l2t.journey-survey-sign-in.v1';
const CLAIM_PREFIX='l2t.journey-survey-sign-in-claim.v1:';
type ClaimedSurvey={createdAt:number;scope:string;draft:JourneySurveyDraft};
const claimedSurveys=new Map<string,ClaimedSurvey>();
const RECOVERY_SCOPE_PREFIX = 'l2t.journey-survey-recovery.v1:';
type RecoverySurvey={scope:string;createdAt:number;draft:JourneySurveyDraft;locale:'tr'|'en'|'sq'};
const recoveryScopes = new Map<string,RecoverySurvey>();
type SignInDraft = { createdAt:number; draft:JourneySurveyDraft };
let signInDraft:SignInDraft|null=null;
let signInDraftStored=false;
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
/** The last submitted scope allows exact-input receipt recovery after reload. */
export function rememberJourneyRecoveryScope(ownerId:string,scope:string,draft:JourneySurveyDraft,locale:'tr'|'en'|'sq') {
  try { key(ownerId,scope); } catch { return; }
  if(!valid(draft)||!['tr','en','sq'].includes(locale))return;
  const value={scope,createdAt:Date.now(),draft:JSON.parse(JSON.stringify(draft)) as JourneySurveyDraft,locale};recoveryScopes.set(ownerId,value);
  try { window.localStorage.setItem(`${RECOVERY_SCOPE_PREFIX}${encodeURIComponent(ownerId)}`,JSON.stringify(value)); } catch { /* Session recovery remains available. */ }
}
export function readJourneyRecoveryDraft(ownerId:string|null|undefined):{scope:string;draft:JourneySurveyDraft;locale:'tr'|'en'|'sq'}|null {
  if(!ownerId)return null;
  try {
    const raw=recoveryScopes.get(ownerId)||JSON.parse(window.localStorage.getItem(`${RECOVERY_SCOPE_PREFIX}${encodeURIComponent(ownerId)}`)||'null');
    if(!raw||!valid(raw.draft)||!['tr','en','sq'].includes(raw.locale)||!Number.isFinite(raw.createdAt)||Date.now()-raw.createdAt<0||Date.now()-raw.createdAt>=24*3600_000)return null;
    // Restore into a new editable scope; later edits cannot mutate the submitted snapshot.
    return {scope:`recovery:${Date.now()}:${Math.random().toString(36).slice(2,10)}`,draft:JSON.parse(JSON.stringify(raw.draft)) as JourneySurveyDraft,locale:raw.locale};
  } catch {return null;}
}
/** Clear only after a confirmed plan result. Unreadable/future drafts are never silently erased. */
export function clearJourneySurveyDraft(ownerId: string | null, scope = 'new'): boolean {
  try {
    if (readJourneySurveyDraft(ownerId, scope).error) return false;
    window.localStorage.removeItem(key(ownerId, scope));
    return true;
  } catch { return false; }
}
/** Only an explicit guest sign-in action carries these answers into one account. */
export function prepareJourneySurveySignIn(draft:JourneySurveyDraft) {
  if(!valid(draft))return false;
  signInDraft={createdAt:Date.now(),draft};
  signInDraftStored=false;
  try { window.localStorage.setItem(SIGN_IN_KEY,JSON.stringify(signInDraft));signInDraftStored=true; } catch { /* Same-session handoff still works. */ }
  return true;
}
export function takeJourneySurveySignIn(ownerId:string):{scope:string;draft:JourneySurveyDraft}|null {
  try {key(ownerId,'new');}catch{return null;}
  let value:unknown=signInDraft;
  let stored=signInDraftStored;
  try { const raw=window.localStorage.getItem(SIGN_IN_KEY);stored=raw!==null;if(!value&&raw&&raw.length<=12000)value=JSON.parse(raw); } catch { /* Keep only a memory handoff that was never persisted. */ }
  signInDraft=null;
  signInDraftStored=false;
  if(!value){
    try {
      const claimed=claimedSurveys.get(ownerId)||JSON.parse(window.localStorage.getItem(`${CLAIM_PREFIX}${encodeURIComponent(ownerId)}`)||'null');
      if(claimed&&typeof claimed.scope==='string'&&Number.isFinite(claimed.createdAt)&&Date.now()-claimed.createdAt>=0&&Date.now()-claimed.createdAt<=30*60_000&&valid(claimed.draft))return {scope:claimed.scope,draft:claimed.draft};
    }catch{/* A missing claim is simply not resumable. */}
    return null;
  }
  if(stored){
    try { window.localStorage.removeItem(SIGN_IN_KEY);if(window.localStorage.getItem(SIGN_IN_KEY)!==null)return null; }
    catch { return null; } // Never replay private answers into another account after a failed consume.
  }
  if(!value||typeof value!=='object')return null;
  const item=value as Record<string,unknown>,age=Date.now()-Number(item.createdAt);
  if(!Number.isFinite(age)||age<0||age>30*60_000||!valid(item.draft))return null;
  const scope=`sign-in:${Date.now()}:${Math.random().toString(36).slice(2,10)}`;
  try { key(ownerId,scope); } catch { return null; }
  saveJourneySurveyDraft(ownerId,item.draft,scope);
  const claimed={createdAt:Number(item.createdAt),scope,draft:item.draft};
  claimedSurveys.set(ownerId,claimed);
  try{window.localStorage.setItem(`${CLAIM_PREFIX}${encodeURIComponent(ownerId)}`,JSON.stringify(claimed));}catch{/* Same-session remount remains safe. */}
  return {scope,draft:item.draft};
}
export function clearJourneySignInClaim(ownerId:string) {
  claimedSurveys.delete(ownerId);
  try{window.localStorage.removeItem(`${CLAIM_PREFIX}${encodeURIComponent(ownerId)}`);}catch{/* The owner-scoped claim expires; it cannot transfer to another account. */}
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
    recoveryScopes.delete(ownerId);
    storage.removeItem(`${RECOVERY_SCOPE_PREFIX}${encodeURIComponent(ownerId)}`);
    claimedSurveys.delete(ownerId);
    storage.removeItem(`${CLAIM_PREFIX}${encodeURIComponent(ownerId)}`);
    return true;
  } catch { return false; }
}
export function journeyInterestsFromWelcome(values: readonly string[]): JourneyInterest[] {
  const mapping: Record<string, JourneyInterest> = { 'Şehir': 'city', 'Kültür': 'culture', 'Yeme-içme': 'food', 'Deniz': 'sea', 'Doğa': 'nature', 'Macera': 'adventure' };
  return [...new Set(values.flatMap(value => mapping[value] ? [mapping[value]] : []))].slice(0, 4);
}
