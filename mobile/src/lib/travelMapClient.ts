import { config } from './config';
import { coordinates, validJourneyPlaceSource } from '../../../lib/travel-assistant/places';
import type { Coordinates, Place } from '../../../lib/travel-assistant/types';
import { normalizeMapAreaResult, type MapSearchResult } from '../../../lib/maps/map-search-result';
export type MapPlace=Place&{address?:string|null;brand?:string|null};
export type MapAreaResult=MapSearchResult;
export type MapDirections={mode:'walking'|'driving';distanceMeters:number;durationSeconds:number;coordinates:Array<[number,number]>;steps:Array<{instruction:string;distanceMeters:number;durationSeconds:number}>;sourceUrl:string;attribution:string};
export class MapServiceError extends Error {
  readonly code:string;
  readonly status:number;
  readonly retryAfter:number;
  constructor(code:string,status=0,retryAfter=0){super(code==='busy'?'busy':'map_unavailable');this.code=code;this.status=status;this.retryAfter=retryAfter;}
}
const cooldowns=new Map<string,{until:number;code:string;status:number}>();
async function json<T>(path:string,signal?:AbortSignal,body?:unknown):Promise<T>{
  const key=path.split('?')[0],cooldown=cooldowns.get(key);
  if(cooldown&&cooldown.until>Date.now())throw new MapServiceError(cooldown.code,cooldown.status,Math.ceil((cooldown.until-Date.now())/1000));
  const r=await fetch(`${config.apiBaseUrl}${path}`,{method:body?'POST':'GET',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),credentials:'omit',signal:AbortSignal.any([AbortSignal.timeout(38_000),...(signal?[signal]:[])])});
  if(!r.ok){
    const data:unknown=await r.json().catch(()=>null),rawCode=data&&typeof data==='object'&&'code'in data?data.code:null;
    const code=r.status===429||rawCode==='busy'?'busy':typeof rawCode==='string'&&/^[a-z-]{1,40}$/.test(rawCode)?rawCode:'map-unavailable';
    const header=r.headers.get('retry-after')||'',delay=/^\d+$/.test(header)?Number(header):(Date.parse(header)-Date.now())/1000;
    const retryAfter=Number.isFinite(delay)&&delay>0?Math.min(86400,Math.ceil(delay)):0;
    if(retryAfter)cooldowns.set(key,{until:Date.now()+retryAfter*1000,code,status:r.status});
    throw new MapServiceError(code,r.status,retryAfter);
  }
  cooldowns.delete(key);return r.json() as Promise<T>;
}
export async function findMapPlaces(center:Coordinates,category='all',query='',signal?:AbortSignal){
  const params=new URLSearchParams({lat:String(center.latitude),lon:String(center.longitude),category,...(query?{q:query}:{})});
  const result=await json<{data:{places:MapPlace[];limited:boolean;fetchedAt:string;stale?:boolean}}>(`/api/maps/places?${params}`,signal);
  if(!result.data||!Array.isArray(result.data.places))throw new Error('invalid_map_data');
  return {...result.data,places:result.data.places.filter(p=>coordinates(p)&&validJourneyPlaceSource(p.id,p.sourceUrl)).slice(0,250)};
}
export async function searchMapAreas(query:string,center:Coordinates,locale:string,signal?:AbortSignal){
  const params=new URLSearchParams({q:query,lat:String(center.latitude),lon:String(center.longitude),lang:locale});
  const result=await json<{data:MapAreaResult[]}>(`/api/maps/search?${params}`,signal);
  return Array.isArray(result.data)?result.data.flatMap(p=>{const result=normalizeMapAreaResult(p);return result?[result]:[];}).slice(0,6):[];
}
export async function getMapDirections(origin:Coordinates,destination:Coordinates,mode:'walking'|'driving',locale:string,signal?:AbortSignal){
  const result=await json<{data:MapDirections}>('/api/maps/directions',signal,{origin,destination,mode,locale});
  const d=result.data;if(!d||d.mode!==mode||!Number.isFinite(d.distanceMeters)||d.distanceMeters<0||!Number.isFinite(d.durationSeconds)||d.durationSeconds<0||!Array.isArray(d.coordinates)||d.coordinates.length<2||d.coordinates.length>50000||d.coordinates.some(p=>!Array.isArray(p)||!coordinates({longitude:p[0],latitude:p[1]})))throw new Error('invalid_directions');
  return d;
}
