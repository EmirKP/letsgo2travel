import { isIOSNative, plugin } from "./capacitor";
import { formatJourneyTime, journeyDayStops, scheduleJourneyDay, type MapJourney } from "./mapJourney";
import { clearJourneyProgressOwner, journeyProgressIsActive, readJourneyProgress, type JourneyProgress } from "./journeyProgress";

type NativeJourneySurface = {
  isAvailable?:()=>Promise<{available?:boolean}>;
  setJourneyOwner?:(options:{ownerId:string})=>Promise<unknown>;
  syncJourneyActivity?:(options:Record<string,unknown>)=>Promise<{active?:boolean}>;
  endJourneyActivity?:(options:{ownerId:string;journeyId?:string;day?:number})=>Promise<unknown>;
};
export type JourneyActivityResult={available:boolean;active:boolean;reason?:"unsupported"|"disabled"|"failed"|"owner-changed"|"session-changed"};
const ownerKey="l2t:journey-live-owner:v1";
const scope=(ownerId?:string|null)=>ownerId||"guest";
let currentOwner:string|undefined;
let generation=0;
let queue:Promise<unknown>=Promise.resolve();
const native=()=>plugin("JourneyLiveActivity") as NativeJourneySurface|undefined;
const enqueue=<T,>(operation:()=>Promise<T>):Promise<T>=>{const next=queue.then(operation,operation);queue=next.catch(()=>undefined);return next;};

export function journeyGuideDeepLink(journeyId:string,day:number,tripId?:string) {
  const query=new URLSearchParams({journeyId,day:String(day)});if(tripId)query.set("tripId",tripId);
  return `letsgo2travel://journey?${query}`;
}

/** App calls on every owner change, including logout. Flight activities are untouched. */
export function syncJourneyLiveActivityOwner(ownerId?:string|null):Promise<void> {
  const next=scope(ownerId);
  if(currentOwner===next)return Promise.resolve();
  let previous=currentOwner;
  if(previous===undefined){try{const saved=JSON.parse(localStorage.getItem(ownerKey)||"null");if(saved?.version===1&&typeof saved.ownerId==="string")previous=saved.ownerId;}catch{/* Native cleanup does not depend on storage. */}}
  currentOwner=next;const request=++generation;
  if(previous&&previous!==next)clearJourneyProgressOwner(previous==="guest"?null:previous);
  try{localStorage.setItem(ownerKey,JSON.stringify({version:1,ownerId:next}));}catch{/* Current session is still isolated in memory. */}
  return enqueue(async()=>{if(request!==generation||!isIOSNative())return;await native()?.setJourneyOwner?.({ownerId:next});}).catch(()=>undefined);
}

export async function journeyLiveActivityAvailability():Promise<JourneyActivityResult> {
  if(!isIOSNative()||!native()?.syncJourneyActivity)return{available:false,active:false,reason:"unsupported"};
  try{const result=await native()?.isAvailable?.();return result?.available?{available:true,active:false}:{available:false,active:false,reason:"disabled"};}
  catch{return{available:false,active:false,reason:"failed"};}
}

export function journeyActivityPayload(journey:MapJourney,day:number,progress:JourneyProgress,language:"tr"|"en"|"sq" | "ro",tripId?:string,now=Date.now()) {
  if(progress.journeyId!==journey.id||progress.day!==day||!journeyProgressIsActive(progress,now))return null;
  const stops=journeyDayStops(journey,day),completed=new Set(progress.completedStopIds);
  const next=stops.find(stop=>!completed.has(stop.id));
  if(!next)return null;
  const scheduled=scheduleJourneyDay(journey,day).stops.find(stop=>stop.stopId===next.id);
  return{ownerId:progress.ownerId,journeyId:journey.id,day,tripId:tripId||"",title:journey.title.slice(0,100),city:journey.city.slice(0,80),language,
    nextStopId:next.id,nextStopName:next.place.name.slice(0,100),nextScheduledTime:scheduled&&scheduled.startMinutes>=0&&scheduled.startMinutes<1440?formatJourneyTime(scheduled.startMinutes):"",
    provisional:scheduled?.timing!=="confirmed",completed:stops.filter(stop=>completed.has(stop.id)).length,total:stops.length,
    startedAt:progress.startedAt,expiresAt:progress.expiresAt,deepLink:journeyGuideDeepLink(journey.id,day,tripId)};
}

/** Only an explicit persisted guide can start/update the native surface. */
export function syncJourneyLiveActivity(ownerId:string|null|undefined,journey:MapJourney,day:number,progress:JourneyProgress,language:"tr"|"en"|"sq" | "ro",tripId?:string):Promise<JourneyActivityResult> {
  const expected=scope(ownerId),request=generation;
  return enqueue(async()=>{
    if(currentOwner!==expected||request!==generation||progress.ownerId!==expected)return{available:false,active:false,reason:"owner-changed"};
    const availability=await journeyLiveActivityAvailability();
    if(!availability.available)return availability;
    if(currentOwner!==expected||request!==generation)return{available:false,active:false,reason:"owner-changed"};
    // A queued callback must not revive an ended guide or replace a newer
    // explicit start for the same day. Read the authoritative manual progress.
    let current:JourneyProgress;
    try{current=readJourneyProgress(ownerId,journey,day);}catch{return{available:true,active:false,reason:"failed"};}
    if(current.startedAt!==progress.startedAt)return{available:true,active:false,reason:"session-changed"};
    const payload=journeyActivityPayload(journey,day,current,language,tripId);
    if(!payload){await native()?.endJourneyActivity?.({ownerId:expected,journeyId:journey.id,day});return{available:true,active:false};}
    try{const result=await native()?.syncJourneyActivity?.(payload);return{available:true,active:result?.active===true};}
    catch{return{available:true,active:false,reason:"failed"};}
  });
}

export function endJourneyLiveActivity(ownerId?:string|null,journeyId?:string,day?:number):Promise<void> {
  const expected=scope(ownerId),request=generation;
  return enqueue(async()=>{if(currentOwner!==expected||request!==generation||!isIOSNative())return;await native()?.endJourneyActivity?.({ownerId:expected,...(journeyId?{journeyId}:{}),...(day?{day}:{})});}).catch(()=>undefined);
}
