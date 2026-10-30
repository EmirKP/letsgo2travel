import { journeyDayStops, validateMapJourney, type MapJourney } from "./mapJourney";

export const JOURNEY_GUIDE_TTL_MS = 8 * 60 * 60 * 1000;
export type JourneyProgress = {
  version: 1; ownerId: string; journeyId: string; day: number;
  stopIds: string[]; completedStopIds: string[];
  startedAt: string | null; expiresAt: string | null; endedAt: string | null; updatedAt: string;
};
const eventName = "l2t:journey-progress";
const owner = (ownerId?: string | null) => ownerId || "guest";
const key = (ownerId?: string | null) => `l2t:journey-progress:v1:${encodeURIComponent(owner(ownerId))}`;
const iso = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const identifier = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9._:/-]{1,160}$/.test(value);

export function validJourneyProgress(value: unknown, ownerId?: string | null): value is JourneyProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as JourneyProgress;
  if (p.version !== 1 || p.ownerId !== owner(ownerId) || !identifier(p.journeyId) || !Number.isInteger(p.day) || p.day < 1 || p.day > 14
    || !Array.isArray(p.stopIds) || p.stopIds.length > 120 || p.stopIds.some(id => !identifier(id)) || new Set(p.stopIds).size !== p.stopIds.length
    || !Array.isArray(p.completedStopIds) || p.completedStopIds.some(id => !p.stopIds.includes(id)) || new Set(p.completedStopIds).size !== p.completedStopIds.length
    || !iso(p.updatedAt) || !(p.endedAt === null || iso(p.endedAt))) return false;
  if (p.startedAt === null || p.expiresAt === null) return p.startedAt === null && p.expiresAt === null && p.endedAt === null && !p.completedStopIds.length;
  return iso(p.startedAt) && iso(p.expiresAt) && Date.parse(p.expiresAt) - Date.parse(p.startedAt) === JOURNEY_GUIDE_TTL_MS
    && (p.endedAt === null || Date.parse(p.endedAt) >= Date.parse(p.startedAt));
}

function readAll(ownerId?: string | null): JourneyProgress[] {
  const raw = localStorage.getItem(key(ownerId));
  if (!raw) return [];
  const data = JSON.parse(raw);
  if (data?.version !== 1 || data.ownerId !== owner(ownerId) || !Array.isArray(data.entries) || data.entries.length > 30
    || data.entries.some((item: unknown) => !validJourneyProgress(item, ownerId))
    || new Set(data.entries.map((item:JourneyProgress)=>`${item.journeyId}:${item.day}`)).size!==data.entries.length) throw new Error("invalid-progress-storage");
  return data.entries.map((item: JourneyProgress) => ({ version: 1, ownerId: item.ownerId, journeyId: item.journeyId, day: item.day,
    stopIds: [...item.stopIds], completedStopIds: [...item.completedStopIds], startedAt: item.startedAt, expiresAt: item.expiresAt, endedAt: item.endedAt, updatedAt: item.updatedAt }));
}
function writeAll(ownerId: string | null | undefined, entries: JourneyProgress[]) {
  localStorage.setItem(key(ownerId), JSON.stringify({ version: 1, ownerId: owner(ownerId), entries: entries.slice(0,30) }));
  window.dispatchEvent(new CustomEvent(eventName, { detail: { ownerId: owner(ownerId) } }));
}
function stopsFor(journey: MapJourney, day: number) {
  if (!validateMapJourney(journey) || !Number.isInteger(day) || day < 1 || day > journey.dayCount) throw new Error("invalid-journey-day");
  return journeyDayStops(journey,day).map(stop=>stop.id);
}
export function journeyProgressIsActive(progress: JourneyProgress, now = Date.now()) {
  return progress.startedAt !== null && progress.endedAt === null && progress.expiresAt !== null && Date.parse(progress.startedAt) <= now && now < Date.parse(progress.expiresAt);
}
export function reconcileJourneyProgress(progress: JourneyProgress, stopIds: readonly string[], now = Date.now()): JourneyProgress {
  const completedStopIds = progress.completedStopIds.filter(id=>stopIds.includes(id));
  const expired = progress.expiresAt !== null && now >= Date.parse(progress.expiresAt);
  return { ...progress, stopIds: [...stopIds], completedStopIds,
    endedAt: progress.endedAt || (expired ? progress.expiresAt : progress.startedAt && completedStopIds.length === stopIds.length ? new Date(now).toISOString() : null) };
}
export function readJourneyProgress(ownerId: string | null | undefined, journey: MapJourney, day: number, now = Date.now()): JourneyProgress {
  const stopIds=stopsFor(journey,day), stored=readAll(ownerId).find(item=>item.journeyId===journey.id&&item.day===day);
  return stored ? reconcileJourneyProgress(stored,stopIds,now) : { version:1,ownerId:owner(ownerId),journeyId:journey.id,day,stopIds,completedStopIds:[],startedAt:null,expiresAt:null,endedAt:null,updatedAt:new Date(now).toISOString() };
}
function storeProgress(ownerId: string | null | undefined, progress: JourneyProgress, endOther = false) {
  const entries=readAll(ownerId).filter(item=>item.journeyId!==progress.journeyId||item.day!==progress.day);
  const next = endOther ? entries.map(item=>journeyProgressIsActive(item,Date.parse(progress.updatedAt)) ? {...item,endedAt:progress.updatedAt,updatedAt:progress.updatedAt} : item) : entries;
  writeAll(ownerId,[progress,...next]);return progress;
}
export function startJourneyProgress(ownerId: string | null | undefined, journey: MapJourney, day: number, now = Date.now()) {
  const previous=readJourneyProgress(ownerId,journey,day,now);
  if (!previous.stopIds.length) throw new Error("empty-journey-day");
  if (journeyProgressIsActive(previous,now)) return previous;
  const startedAt=new Date(now).toISOString();
  return storeProgress(ownerId,{...previous,completedStopIds:previous.completedStopIds.length===previous.stopIds.length?[]:previous.completedStopIds,startedAt,expiresAt:new Date(now+JOURNEY_GUIDE_TTL_MS).toISOString(),endedAt:null,updatedAt:startedAt},true);
}
export function completeJourneyStop(ownerId: string | null | undefined, journey: MapJourney, day: number, stopId: string, completed: boolean, now = Date.now()) {
  const previous=readJourneyProgress(ownerId,journey,day,now);
  if (!journeyProgressIsActive(previous,now) || !previous.stopIds.includes(stopId)) throw new Error("inactive-journey-stop");
  const selected=new Set(previous.completedStopIds);if(completed)selected.add(stopId);else selected.delete(stopId);
  const next=reconcileJourneyProgress({...previous,completedStopIds:previous.stopIds.filter(id=>selected.has(id)),updatedAt:new Date(now).toISOString()},previous.stopIds,now);
  return storeProgress(ownerId,next);
}
export function endJourneyProgress(ownerId: string | null | undefined, journey: MapJourney, day: number, now=Date.now()) {
  const previous=readJourneyProgress(ownerId,journey,day,now);
  if (!previous.startedAt) return previous;
  return storeProgress(ownerId,{...previous,endedAt:previous.endedAt||new Date(now).toISOString(),updatedAt:new Date(now).toISOString()});
}
export function persistReconciledJourneyProgress(ownerId: string | null | undefined, journey: MapJourney, day: number, now=Date.now()) {
  const progress=readJourneyProgress(ownerId,journey,day,now);
  if(progress.startedAt)storeProgress(ownerId,progress);
  return progress;
}
export function clearJourneyProgressOwner(ownerId?: string | null) {
  try { localStorage.removeItem(key(ownerId)); window.dispatchEvent(new CustomEvent(eventName,{detail:{ownerId:owner(ownerId)}})); } catch { /* Native account cleanup still runs if device storage fails. */ }
}
export function subscribeJourneyProgress(ownerId: string | null | undefined, callback:()=>void) {
  const changed=(event:Event)=>{if((event as CustomEvent<{ownerId?:string}>).detail?.ownerId===owner(ownerId))callback();};
  const stored=(event:StorageEvent)=>{if(!event.key||event.key===key(ownerId))callback();};
  window.addEventListener(eventName,changed);window.addEventListener("storage",stored);
  return()=>{window.removeEventListener(eventName,changed);window.removeEventListener("storage",stored);};
}
