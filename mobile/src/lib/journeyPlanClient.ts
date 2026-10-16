import { requestJson } from './api';
import { coordinates, distanceKm } from '../../../lib/travel-assistant/places';
import type { JourneyPlanRequest, JourneyPlanResult } from '../../../lib/travel-assistant/journey-plan-types';
import { addJourneyStop, createMapJourney, validateJourneyPlace, validateJourneyPlanning, validateMapJourney, type MapJourney } from './mapJourney';

const record = (value:unknown):Record<string,unknown> => value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
const safeText = (value:unknown,max:number):value is string => typeof value==='string' && value.trim().length>0 && value.length<=max && !/[<>]/.test(value) && ![...value].some(char=>char.charCodeAt(0)===127||(char.charCodeAt(0)<32&&!['\t','\n','\r'].includes(char)));
const recoveryTtl = 24 * 60 * 60_000;
type Operation = { id: string; fingerprint: string; createdAt: number };
const operations = new Map<string, Operation>();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

async function recoveryOperation(input: JourneyPlanRequest, token: string, ownerId: string | null) {
  // Persist only an opaque operation ID and digest, never tokens or travel notes.
  const canonical = JSON.stringify([input.destination.name,input.destination.latitude,input.destination.longitude,input.destination.sourceUrl ?? null,
    input.dayCount,input.startDate ?? null,input.firstDayStartTime ?? null,input.locale,input.party,input.budget,input.pace,input.walking,input.interests,input.notes,input.placeCategoryVersion ?? null]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
  const storageKey = token && !ownerId ? null : `l2t.mobile.journey-operation.v1.${encodeURIComponent(ownerId || 'guest')}`;
  const key = `${storageKey || token}:${fingerprint}`;
  const usable = (value: unknown): value is Operation => {
    const row=record(value), age=Date.now()-Number(row.createdAt);
    return typeof row.id==='string' && uuid.test(row.id) && row.fingerprint===fingerprint && age>=0 && age<recoveryTtl;
  };
  let operation = operations.get(key);
  if (!usable(operation) && storageKey) {
    try { const saved: unknown = JSON.parse(localStorage.getItem(storageKey) || 'null'); if(usable(saved))operation=saved; } catch { /* Private mode still supports same-session retries. */ }
  }
  if (!usable(operation)) operation={id:crypto.randomUUID(),fingerprint,createdAt:Date.now()};
  operations.set(key,operation);
  if(operations.size>32)operations.delete(operations.keys().next().value!);
  if(storageKey)try{localStorage.setItem(storageKey,JSON.stringify(operation));}catch{ /* Memory remains usable. */ }
  const id=operation.id;
  return {id, clear:()=>{
    if(operations.get(key)?.id===id)operations.delete(key);
    if(storageKey)try{if(record(JSON.parse(localStorage.getItem(storageKey)||'null')).id===id)localStorage.removeItem(storageKey);}catch{ /* No destructive reset. */ }
  }};
}

function waitForPending(signal: AbortSignal) {
  return new Promise<void>((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason);};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},1500);
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  });
}

/** Generated text can choose only server-resolved places. Validate again before saving a plan. */
export function validateJourneyPlanResponse(raw:unknown, request:JourneyPlanRequest):JourneyPlanResult {
  const value=record(raw), destination=record(value.destination), center=coordinates(destination);
  const expectedDate=request.startDate || null;
  if (!center || center.latitude!==request.destination.latitude || center.longitude!==request.destination.longitude
    || destination.name!==request.destination.name || destination.sourceUrl!==request.destination.sourceUrl || value.dayCount!==request.dayCount || value.startDate!==expectedDate
    || (value.firstDayStartTime ?? null)!==(request.firstDayStartTime || null)
    || value.locale!==request.locale || value.generatedBy!=='ai' || !Array.isArray(value.days) || value.days.length!==request.dayCount) throw new Error('invalid-plan');
  const prefs=record(value.preferences);
  for(const key of ['party','budget','pace','walking','notes'] as const) if(prefs[key]!==request[key])throw new Error('plan-mismatch');
  if(!Array.isArray(prefs.interests)||JSON.stringify(prefs.interests)!==JSON.stringify(request.interests))throw new Error('plan-mismatch');
  const fetched=typeof value.fetchedAt==='string'?Date.parse(value.fetchedAt):NaN;
  // A recovered itinerary keeps its original timestamp; it is never redated.
  if(!Number.isFinite(fetched)||Date.now()-fetched>recoveryTtl||fetched-Date.now()>60_000)throw new Error('invalid-plan');
  if(!validateJourneyPlanning(value,request.dayCount))throw new Error('invalid-plan');
  const ids=new Set<string>();let total=0;
  for(const [index,item] of value.days.entries()) {
    const day=record(item);
    if(day.day!==index+1||!safeText(day.theme,120)||!safeText(day.explanation,800)||!Array.isArray(day.stops)||day.stops.length<2||day.stops.length>8)throw new Error('invalid-plan');
    for(const item of day.stops) {
      const stop=record(item);
      if(!validateJourneyPlace(stop.place)||ids.has(stop.place.id)||distanceKm(center,stop.place)>4
        ||!safeText(stop.reason,500)||!Number.isInteger(stop.durationMinutes)||Number(stop.durationMinutes)<15||Number(stop.durationMinutes)>240)throw new Error('invalid-plan');
      ids.add(stop.place.id);total++;
    }
  }
  if(total>112)throw new Error('invalid-plan');
  return value as unknown as JourneyPlanResult;
}

export async function generateJourneyPlan(input:JourneyPlanRequest, accessToken:string, signal:AbortSignal, ownerId:string|null=null):Promise<JourneyPlanResult> {
  const request:JourneyPlanRequest={...input,placeCategoryVersion:2};
  const operation=await recoveryOperation(request,accessToken,ownerId);
  const deadline=Date.now()+55_000;
  for (;;) {
    signal.throwIfAborted();
    try {
      const raw=await requestJson<unknown>('/api/travel-assistant/journey-plan',{
        method:'POST',body:request,headers:{...(accessToken?{Authorization:`Bearer ${accessToken}`}:{ }), 'Idempotency-Key':operation.id},
        signal,timeoutMs:Math.max(1,deadline-Date.now()),
      });
      const result=validateJourneyPlanResponse(raw,request);operation.clear();return result;
    } catch(error) {
      const code=record(error).code;
      if(code==='plan_expired'||code==='plan_conflict')operation.clear();
      // Only a confirmed existing operation is polled. Transport failures retain
      // the ID for an explicit retry; they never trigger a blind second POST.
      if(code!=='plan_pending'||Date.now()+1500>=deadline)throw error;
      await waitForPending(signal);
    }
  }
}

export function journeyFromAiPlan(result:JourneyPlanResult):MapJourney {
  let journey=createMapJourney({city:result.destination.name,center:result.destination,dayCount:result.dayCount,
    startDate:result.startDate,firstDayStartTime:result.firstDayStartTime,pace:result.preferences.pace,interests:result.preferences.interests});
  for(const day of result.days)for(const stop of day.stops) {
    journey=addJourneyStop(journey,stop.place,day.day,{durationMinutes:stop.durationMinutes,note:stop.reason,sourceUrl:stop.place.sourceUrl});
  }
  journey={...journey,planning:{preferences:result.preferences,locale:result.locale,summary:result.summary,
    days:result.days.map(({day,theme,explanation})=>({day,theme,explanation})),limitations:result.limitations,
    fetchedAt:result.fetchedAt,attribution:result.attribution,generatedBy:'ai'}};
  if(!validateMapJourney(journey))throw new Error('invalid-plan');
  return journey;
}
