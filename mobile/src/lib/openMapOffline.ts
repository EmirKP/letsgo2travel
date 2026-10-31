import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import type { StyleSpecification } from 'maplibre-gl';
import type { Place, Coordinates } from '../../../lib/travel-assistant/types';
import { OPEN_MAP_STYLE, OPEN_MAP_MAX_BYTES, OPEN_MAP_MAX_RESOURCES, OPEN_MAP_RESOURCE_MAX_BYTES, OPEN_MAP_MAX_PACKS, allowedOpenMapUrl, allowedOpenMapTemplate, regionBounds, regionTiles, OPEN_MAP_MIN_ZOOM, OPEN_MAP_MAX_ZOOM } from '../../../lib/maps/open-map-resources';
import { config } from './config';
import { openMapFeaturePlaces } from '../../../lib/maps/open-map-pois';

export type OpenMapPack = {
  version: 1; id: string; name: string; center: Coordinates; bounds: ReturnType<typeof regionBounds>;
  radiusKm: number; createdAt: string; bytes: number; resourceCount: number; tileCount: number;
  style: StyleSpecification; places: Place[]; resources: { url: string; data: ArrayBuffer }[];
};
export type OpenMapPackSummary = Omit<OpenMapPack, 'resources' | 'style' | 'places'>;
const DB_NAME = 'letsgo2travel-open-map-v1', STORE = 'regions';
let database: Promise<IDBDatabase> | undefined;
const memory = new Map<string, OpenMapPack>();
const eventName = 'l2t-open-map-packs';
export function subscribeOpenMapPacks(listener: () => void) { window.addEventListener(eventName, listener); return () => window.removeEventListener(eventName, listener); }
function db() {
  if (!database) {
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('storage_unavailable')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    let abandoned = false;
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => { if (abandoned) request.result.close?.(); else resolve(request.result); };
    request.onerror = request.onblocked = () => { abandoned = true; reject(new Error('storage_unavailable')); };
    });
    const attempt = opening.catch(() => {
      // indexedDB.open may throw synchronously while storage is temporarily
      // unavailable. Do not cache that rejected promise for the entire session.
      if (database === attempt) database = undefined;
      throw new Error('storage_unavailable');
    });
    database = attempt;
  }
  return database;
}
function summary(p: OpenMapPack): OpenMapPackSummary {
  return { version: 1, id: p.id, name: p.name, center: p.center, bounds: p.bounds, radiusKm: p.radiusKm, createdAt: p.createdAt, bytes: p.bytes, resourceCount: p.resourceCount, tileCount: p.tileCount };
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function validPlace(value: unknown, bounds: ReturnType<typeof regionBounds>): value is Place {
  return object(value) && typeof value.id === 'string' && /^(node|way|relation)\/[1-9]\d*$/.test(value.id) && value.sourceUrl === `https://www.openstreetmap.org/${value.id}` && typeof value.name === 'string' && typeof value.category === 'string' && typeof value.fetchedAt === 'string' && typeof value.latitude === 'number' && typeof value.longitude === 'number' && Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && value.latitude >= bounds.south && value.latitude <= bounds.north && value.longitude >= bounds.west && value.longitude <= bounds.east;
}
function validStyle(value: unknown): value is StyleSpecification {
  if (!object(value) || value.version !== 8 || !object(value.sources) || !Array.isArray(value.layers) || value.layers.length > 1000) return false;
  if (value.glyphs !== undefined && !allowedOpenMapTemplate(value.glyphs, 'glyph')) return false;
  if (value.sprite !== undefined && (typeof value.sprite !== 'string' || !allowedOpenMapUrl(value.sprite + '.json'))) return false;
  return Object.values(value.sources).length > 0 && Object.values(value.sources).every(source => object(source) && source.type === 'vector' && !('url' in source) && Array.isArray(source.tiles) && source.tiles.length === 1 && !!allowedOpenMapTemplate(source.tiles[0], 'tile'));
}

/** The map only renders these label fields; translated name:* tags are not all visible. */
function glyphPlan(style: StyleSpecification) {
  const fonts=new Map<string,Set<number>>(),layers=new Map<string,Map<string,Set<string>>>();
  const characters=(font:string,value:unknown)=>{
    if(typeof value!=='string'&&typeof value!=='number')return;
    const ranges=fonts.get(font)!;
    const label=String(value);
    // Style expressions and text-transform can change case across Unicode blocks.
    for(const character of label+label.toUpperCase()+label.toLowerCase()){const point=character.codePointAt(0)!;if(point<=65535)ranges.add(Math.floor(point/256)*256);}
  };
  for(const layer of style.layers){
    if(layer.type!=='symbol'||!layer.layout||layer.layout['text-field']===undefined||layer.maxzoom!==undefined&&layer.maxzoom<=OPEN_MAP_MIN_ZOOM||layer.minzoom!==undefined&&layer.minzoom>19)continue;
    const family=layer.layout['text-font'];
    if(!Array.isArray(family)||!family.length||!family.every(value=>typeof value==='string'))throw new Error('invalid_map_style');
    const font=(family as string[]).join(',');if(!fonts.has(font))fonts.set(font,new Set([0,256]));
    const fields=new Set<string>();
    const inspect=(value:unknown)=>{
      if(typeof value==='string'){
        for(const match of value.matchAll(/\{([^{}]+)\}/g))fields.add(match[1]);
        characters(font,value.replace(/\{[^{}]+\}/g,''));
      }else if(Array.isArray(value)){
        if(value[0]==='get'&&typeof value[1]==='string')fields.add(value[1]);
        value.forEach(inspect);
      }else if(object(value))Object.values(value).forEach(inspect);
    };
    inspect(layer.layout['text-field']);
    const sourceLayer=layer['source-layer'];
    if(sourceLayer&&fields.size){
      let layerFonts=layers.get(sourceLayer);if(!layerFonts){layerFonts=new Map();layers.set(sourceLayer,layerFonts);}
      let used=layerFonts.get(font);if(!used){used=new Set();layerFonts.set(font,used);}
      for(const field of fields)used.add(field);
    }
  }
  return {fonts,collect(tile:VectorTile){
    for(const [name,layerFonts]of layers){
      const layer=tile.layers[name];if(!layer)continue;
      for(let index=0;index<layer.length;index++){
        const properties=layer.feature(index).properties;
        for(const [font,fields]of layerFonts)for(const field of fields)characters(font,properties[field]);
      }
    }
  }};
}
function validPack(value: unknown): value is OpenMapPack {
  if (!object(value) || value.version !== 1 || typeof value.id !== 'string' || typeof value.name !== 'string' || value.name.length > 100 || !object(value.center) || !object(value.bounds) || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) || !Array.isArray(value.resources) || !Array.isArray(value.places) || value.places.length > 250 || !validStyle(value.style)) return false;
  let expected;
  try { expected = regionBounds(Number(value.center.latitude), Number(value.center.longitude), Number(value.radiusKm)); } catch { return false; }
  const bounds=value.bounds;
  if (typeof value.center.latitude !== 'number' || typeof value.center.longitude !== 'number' || typeof value.radiusKm !== 'number' || value.id !== `${value.center.latitude.toFixed(3)}:${value.center.longitude.toFixed(3)}:${value.radiusKm}` || Object.entries(expected).some(([key, number]) => typeof bounds[key] !== 'number' || !Number.isFinite(bounds[key]) || Math.abs(Number(bounds[key]) - Number(number)) > 1e-9) || !value.places.every(place=>validPlace(place,expected))) return false;
  if (value.resources.length < 1 || value.resources.length > OPEN_MAP_MAX_RESOURCES || value.resourceCount !== value.resources.length || typeof value.tileCount !== 'number' || !Number.isInteger(value.tileCount) || value.tileCount < 1 || value.tileCount > value.resources.length) return false;
  const seen = new Set<string>(); let bytes = 0;
  for (const resource of value.resources) {
    if (!object(resource) || !(resource.data instanceof ArrayBuffer) || resource.data.byteLength > OPEN_MAP_RESOURCE_MAX_BYTES) return false;
    const safe = allowedOpenMapUrl(resource.url);
    if (!safe || seen.has(safe)) return false;
    seen.add(safe); bytes += resource.data.byteLength;
    if (bytes > OPEN_MAP_MAX_BYTES) return false;
  }
  return bytes === value.bytes;
}
export async function listOpenMapPacks(): Promise<OpenMapPackSummary[]> {
  const database = await db();
  return new Promise((resolve,reject) => { const r = database.transaction(STORE).objectStore(STORE).getAll(); r.onsuccess = () => resolve((r.result as unknown[]).filter(validPack).map(summary).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))); r.onerror=()=>reject(new Error('storage_unavailable')); });
}
export async function readOpenMapPack(id: string): Promise<OpenMapPack | null> {
  if (memory.has(id)) return memory.get(id)!;
  const database = await db();
  return new Promise((resolve,reject) => {
    const r=database.transaction(STORE).objectStore(STORE).get(id);
    r.onsuccess=()=>{ const p=r.result as unknown; if (!validPack(p) || p.id !== id) { resolve(null); return; } memory.clear(); memory.set(id,p); resolve(p); };
    r.onerror=()=>reject(new Error('storage_unavailable'));
  });
}
async function persist(pack: OpenMapPack, signal: AbortSignal) {
  signal.throwIfAborted();
  const database = await db();
  signal.throwIfAborted();
  if (!validPack(pack)) throw new Error('invalid_map_pack');
  await new Promise<void>((resolve,reject) => {
    const tx=database.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),r=store.getAllKeys(); let full=false;
    const abort=()=>{ try { tx.abort(); } catch { /* A completed transaction is already atomic. */ } };
    const done=(error?:unknown)=>{ signal.removeEventListener('abort',abort); if(error)reject(error);else resolve(); };
    signal.addEventListener('abort',abort,{once:true});
    r.onsuccess=()=>{ if(signal.aborted){abort();return;}if(r.result.length>=OPEN_MAP_MAX_PACKS&&!r.result.includes(pack.id)){full=true;tx.abort();} else store.put(pack); };
    tx.oncomplete=()=>done();tx.onerror=()=>done(new Error('storage_unavailable'));tx.onabort=()=>done(signal.aborted ? signal.reason || new DOMException('Aborted','AbortError') : new Error(full?'pack_limit':'storage_unavailable'));
  });
  memory.clear();memory.set(pack.id,pack);window.dispatchEvent(new Event(eventName));
}
export async function deleteOpenMapPack(id: string) {
  const database=await db();
  await new Promise<void>((resolve,reject)=>{const t=database.transaction(STORE,'readwrite');t.objectStore(STORE).delete(id);t.oncomplete=()=>resolve();t.onerror=()=>reject(new Error('storage_unavailable'));});
  memory.delete(id);window.dispatchEvent(new Event(eventName));
}
export async function fetchOpenMapResource(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const safe=allowedOpenMapUrl(url);if(!safe)throw new Error('invalid_map_resource');
  signal?.throwIfAborted();
  const result=await fetch(`${config.apiBaseUrl}/api/maps/resource?url=${encodeURIComponent(safe)}`,{signal,credentials:'omit'});
  if(!result.ok)throw new Error('map_unavailable');
  if(!result.body || Number(result.headers.get('content-length'))>OPEN_MAP_RESOURCE_MAX_BYTES){await result.body?.cancel().catch(()=>{});throw new Error('map_resource_too_large');}
  const reader=result.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  const abort=()=>{void reader.cancel().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  try{while(true){signal?.throwIfAborted();const part=await reader.read();signal?.throwIfAborted();if(part.done)break;size+=part.value.byteLength;if(size>OPEN_MAP_RESOURCE_MAX_BYTES){await reader.cancel().catch(()=>{});throw new Error('map_resource_too_large');}chunks.push(part.value);}}
  finally{signal?.removeEventListener('abort',abort);reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes.buffer;
}
const json=<T,>(bytes:ArrayBuffer):T=>JSON.parse(new TextDecoder().decode(bytes)) as T;
export function mapResourceUrl(url:string,packId?:string){
  const check=url.replace('{fontstack}','Noto Sans Regular').replace('{range}','0-255').replace('{z}','10').replace('{x}','1').replace('{y}','1');
  if(!allowedOpenMapUrl(check))throw new Error('invalid_map_resource');
  const encoded=encodeURIComponent(url).replace(/%7B(fontstack|range|z|x|y)%7D/g,'{$1}');
  return `l2t-map://resource?url=${encoded}${packId?`&pack=${encodeURIComponent(packId)}`:''}`;
}
export async function resolveMapResource(request:string,signal:AbortSignal,responseType:'json'|'string'|'arrayBuffer'|'image'='arrayBuffer'){
  signal.throwIfAborted();
  const parsed=new URL(request),url=allowedOpenMapUrl(parsed.searchParams.get('url')),id=parsed.searchParams.get('pack');
  if(parsed.protocol!=='l2t-map:'||parsed.hostname!=='resource'||!url)throw new Error('invalid_map_resource');
  let data:ArrayBuffer;
  if(id){const pack=await readOpenMapPack(id);signal.throwIfAborted();const resource=pack?.resources.find(r=>allowedOpenMapUrl(r.url)===url);if(!resource)throw new Error('outside_download');data=resource.data.slice(0);}
  else data=await fetchOpenMapResource(url,signal);
  // MapLibre's custom protocols bypass its HTTP JSON/text decoder. Match request.type
  // for TileJSON and sprite metadata; glyphs, vector tiles and encoded images stay binary.
  if(responseType==='json'){
    const value:unknown=json(data);if(!value||typeof value!=='object')throw new Error('invalid_map_resource');
    return {data:value};
  }
  if(responseType==='string')return {data:new TextDecoder().decode(data)};
  return {data};
}
export function preparedMapStyle(style: StyleSpecification, packId?: string): StyleSpecification {
  const cloned=structuredClone(style);
  // At city zooms the Natural Earth raster adds requests without useful detail.
  const rasterIds=Object.entries(cloned.sources).filter(([,s])=>s.type==='raster').map(([id])=>id);
  for(const id of rasterIds)delete cloned.sources[id];
  cloned.layers=cloned.layers.filter(layer=>!('source'in layer)||!rasterIds.includes(String(layer.source)));
  for(const source of Object.values(cloned.sources)){
    if('url'in source&&typeof source.url==='string')source.url=mapResourceUrl(source.url,packId);
    if('tiles'in source&&source.tiles)source.tiles=source.tiles.map(t=>mapResourceUrl(t,packId));
  }
  if(cloned.glyphs)cloned.glyphs=mapResourceUrl(cloned.glyphs,packId);
  // Sprite suffixes are appended by the renderer, so handle them in transformRequest.
  return cloned;
}
export function resourceTransform(url:string,packId?:string){
  if(url.startsWith('l2t-map:'))return {url};
  const valid=allowedOpenMapUrl(url);if(!valid)throw new Error('invalid_map_resource');return {url:mapResourceUrl(valid,packId)};
}
export async function loadOpenMapStyle(signal?:AbortSignal){return json<StyleSpecification>(await fetchOpenMapResource(OPEN_MAP_STYLE,signal));}

/** All resources are downloaded before the one atomic IndexedDB commit. */
export async function downloadOpenMapRegion(input:{center:Coordinates;name:string;radiusKm:1|2|3;places:Place[];signal:AbortSignal;onProgress:(bytes:number,count:number)=>void}){
  const {center,radiusKm}=input,bounds=regionBounds(center.latitude,center.longitude,radiusKm);
  input.signal.throwIfAborted();
  const controller=new AbortController(),signal=controller.signal;
  const abort=()=>controller.abort(input.signal.reason);
  input.signal.addEventListener('abort',abort,{once:true});
  const resources=new Map<string,ArrayBuffer>(),pending=new Map<string,Promise<ArrayBuffer>>(),tilePlaces=new Map<string,Place>();let total=0,tileCount=0;
  const take=async(raw:string):Promise<ArrayBuffer>=>{
    signal.throwIfAborted();
    const url=allowedOpenMapUrl(raw);if(!url)throw new Error('invalid_map_resource');
    if(resources.has(url))return resources.get(url)!;
    const existing=pending.get(url);if(existing)return existing;
    if(resources.size+pending.size>=OPEN_MAP_MAX_RESOURCES)throw new Error('area_too_large');
    const operation=(async()=>{
      const data=await fetchOpenMapResource(url,signal);signal.throwIfAborted();
      if(total+data.byteLength>OPEN_MAP_MAX_BYTES)throw new Error('area_too_large');
      total+=data.byteLength;resources.set(url,data);input.onProgress(total,resources.size);return data;
    })().finally(()=>pending.delete(url));
    pending.set(url,operation);return operation;
  };
  async function pool<T>(values:T[],task:(value:T)=>Promise<unknown>){
    let cursor=0,failure:unknown;
    await Promise.all(Array.from({length:Math.min(4,values.length)},async()=>{
      try{while(!signal.aborted&&cursor<values.length)await task(values[cursor++]);}
      catch(error){if(!failure){failure=error;controller.abort(error);}}
    }));
    if(failure)throw failure;
    signal.throwIfAborted();
  }
  try{
    const style=json<StyleSpecification>(await take(OPEN_MAP_STYLE));
    if(!style||style.version!==8||!object(style.sources)||!Array.isArray(style.layers))throw new Error('invalid_map_style');
    const tileUrls:string[]=[];
    for(const [id,source]of Object.entries(style.sources)){
      if(source.type!=='vector'){delete style.sources[id];style.layers=style.layers.filter(l=>!('source'in l)||l.source!==id);continue;}
      let data:{tiles?:string[];url?:string}=source;
      if(data.url)data={...data,...json<{tiles:string[]}>(await take(data.url))};
      if(!Array.isArray(data.tiles)||!allowedOpenMapTemplate(data.tiles[0],'tile'))throw new Error('invalid_tile_source');
      const template=data.tiles[0];
      tileUrls.push(...regionTiles(bounds,template));
      // One validated mirror is enough. Embedding it avoids all metadata requests offline.
      style.sources[id]={type:'vector',tiles:[template],minzoom:OPEN_MAP_MIN_ZOOM,maxzoom:OPEN_MAP_MAX_ZOOM,attribution:'© OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors'};
    }
    if(!validStyle(style))throw new Error('invalid_map_style');
    const glyphs=glyphPlan(style);
    const work=async(url:string)=>{
      const data=await take(url);tileCount++;
      const tile=new VectorTile(new PbfReader(data));glyphs.collect(tile);
      // Reuse the very same downloaded OSM tile bytes for the offline POI list.
      const match=new URL(url).pathname.match(/\/(\d+)\/(\d+)\/(\d+)\.pbf$/),layer=tile.layers.poi;
      if(match&&Number(match[1])===OPEN_MAP_MAX_ZOOM&&layer){
        const features=[];
        for(let index=0;index<Math.min(layer.length,20000);index++)features.push(layer.feature(index).toGeoJSON(Number(match[2]),Number(match[3]),Number(match[1])));
        for(const place of openMapFeaturePlaces(features,center,{bounds}))if(tilePlaces.size<250)tilePlaces.set(place.id,place);
      }
    };
    await pool([...new Set(tileUrls)],work);
    const assets:string[]=[];
    if(style.glyphs)for(const [font,ranges]of glyphs.fonts)for(const start of ranges)assets.push(style.glyphs.replace('{fontstack}',encodeURIComponent(font)).replace('{range}',`${start}-${start+255}`));
    if(typeof style.sprite==='string')for(const suffix of ['.json','.png','@2x.json','@2x.png'])assets.push(style.sprite+suffix);
    await pool([...new Set(assets)],take);signal.throwIfAborted();
    const places=[...new Map([...input.places.filter(place=>validPlace(place,bounds)),...tilePlaces.values()].map(place=>[place.id,place])).values()].slice(0,250);
    const pack:OpenMapPack={version:1,id:`${center.latitude.toFixed(3)}:${center.longitude.toFixed(3)}:${radiusKm}`,name:input.name.trim().slice(0,100)||'Harita',center:{...center},bounds,radiusKm,createdAt:new Date().toISOString(),bytes:total,resourceCount:resources.size,tileCount,style,places,resources:[...resources].map(([url,data])=>({url,data}))};
    await persist(pack,signal);return summary(pack);
  }finally{input.signal.removeEventListener('abort',abort);controller.abort();}
}
