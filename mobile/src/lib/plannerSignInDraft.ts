import type { PlannerInput } from '../types';
import type { AirportOption } from './airports';
import { validTravelParty } from '../../../lib/planner-preferences';

export type PlannerRecoveryDraft={form:PlannerInput;origin:AirportOption|null;destination:AirportOption|null;locale?:'tr'|'en'|'sq' | 'ro'};
type Draft=PlannerRecoveryDraft;
const key='l2t.planner-sign-in.v1';
const claimPrefix='l2t.planner-sign-in-claim.v1:';
const claims=new Map<string,{createdAt:number;draft:Draft}>();
let pending:{createdAt:number;draft:Draft}|null=null;
let stored=false;
const recoveryPrefix='l2t.planner-recovery-draft.v1:';
const recoveryDrafts=new Map<string,{createdAt:number;draft:Draft}>();
const text=(value:unknown,max=500):value is string=>typeof value==='string'&&value.length<=max;
function validAirport(value:unknown):value is AirportOption|null {
  if(value===null)return true;
  if(!value||typeof value!=='object')return false;
  const row=value as Record<string,unknown>;
  return typeof row.iata==='string'&&/^[A-Z]{3}$/.test(row.iata)&&['name','city','country','countryCode'].every(field=>text(row[field],260));
}
function validDraft(value:unknown):value is Draft {
  if(!value||typeof value!=='object')return false;
  const row=value as Draft,form=row.form;
  return !!form&&typeof form==='object'&&['origin','days','month','budget','accommodation','who','tempo','visa'].every(field=>text((form as unknown as Record<string,unknown>)[field]))
    &&(row.locale===undefined||['tr','en','sq', 'ro'].includes(row.locale))
    &&Array.isArray(form.vibe)&&form.vibe.length<=4&&form.vibe.every(item=>text(item,100))&&validAirport(row.origin)&&validAirport(row.destination)
    &&(form.party===undefined||validTravelParty(form.party))&&(form.dayCount===undefined||Number.isInteger(form.dayCount)&&form.dayCount>=1&&form.dayCount<=14)
    &&(form.destination===undefined||!!form.destination&&typeof form.destination==='object'&&['code','name','country','countryCode'].every(field=>text((form.destination as unknown as Record<string,unknown>)[field],260)));
}
/** Private input snapshot; the opaque operation receipt stays in the API client. */
export function savePlannerRecoveryDraft(ownerId:string,draft:Draft) {
  if(!ownerId||!validDraft(draft))return;
  const value={createdAt:Date.now(),draft:JSON.parse(JSON.stringify(draft)) as Draft};
  recoveryDrafts.set(ownerId,value);
  if(recoveryDrafts.size>32)recoveryDrafts.delete(recoveryDrafts.keys().next().value!);
  try{window.localStorage.setItem(`${recoveryPrefix}${encodeURIComponent(ownerId)}`,JSON.stringify(value));}catch{/* Session recovery remains possible. */}
  claims.delete(ownerId);
  try{window.localStorage.removeItem(`${claimPrefix}${encodeURIComponent(ownerId)}`);}catch{/* Owner-scoped claims expire. */}
}
export function readPlannerRecoveryDraft(ownerId:string|null|undefined):Draft|null {
  if(!ownerId)return null;
  try {
    const raw=recoveryDrafts.get(ownerId)||JSON.parse(window.localStorage.getItem(`${recoveryPrefix}${encodeURIComponent(ownerId)}`)||'null');
    if(!raw||!Number.isFinite(raw.createdAt)||Date.now()-raw.createdAt<0||Date.now()-raw.createdAt>=24*3600_000||!validDraft(raw.draft))return null;
    return JSON.parse(JSON.stringify(raw.draft)) as Draft;
  }catch{return null;}
}
export function clearPlannerRecoveryDraft(ownerId:string):boolean {
  if(!ownerId)return false;
  recoveryDrafts.delete(ownerId);
  claims.delete(ownerId);
  try {window.localStorage.removeItem(`${recoveryPrefix}${encodeURIComponent(ownerId)}`);window.localStorage.removeItem(`${claimPrefix}${encodeURIComponent(ownerId)}`);return true;}catch{return false;}
}
export function preparePlannerSignInDraft(draft:Draft) {
  if(!validDraft(draft))return false;
  pending={createdAt:Date.now(),draft:JSON.parse(JSON.stringify(draft)) as Draft};stored=false;
  try{window.localStorage.setItem(key,JSON.stringify(pending));stored=true;}catch{/* A same-session sign-in can still retain the form. */}
  return true;
}
export function takePlannerSignInDraft(ownerId:string|null|undefined):Draft|null {
  if(!ownerId)return null;
  let value:unknown=pending,wasStored=stored;
  try{const raw=window.localStorage.getItem(key);wasStored=raw!==null;if(!value&&raw&&raw.length<=16000)value=JSON.parse(raw);}catch{/* Use an unpersisted memory handoff only. */}
  pending=null;stored=false;
  if(!value){
    try{const claimed=claims.get(ownerId)||JSON.parse(window.localStorage.getItem(`${claimPrefix}${encodeURIComponent(ownerId)}`)||'null');if(claimed&&Number.isFinite(claimed.createdAt)&&Date.now()-claimed.createdAt>=0&&Date.now()-claimed.createdAt<=30*60_000&&validDraft(claimed.draft))return claimed.draft;}catch{/* No claim to resume. */}
    return null;
  }
  if(wasStored){try{window.localStorage.removeItem(key);if(window.localStorage.getItem(key)!==null)return null;}catch{return null;}}
  if(!value||typeof value!=='object')return null;
  const row=value as {createdAt:unknown;draft:unknown},age=Date.now()-Number(row.createdAt);
  if(!Number.isFinite(age)||age<0||age>30*60_000||!validDraft(row.draft))return null;
  const claimed={createdAt:Number(row.createdAt),draft:row.draft};claims.set(ownerId,claimed);
  try{window.localStorage.setItem(`${claimPrefix}${encodeURIComponent(ownerId)}`,JSON.stringify(claimed));}catch{/* Session replay remains available. */}
  return row.draft;
}
