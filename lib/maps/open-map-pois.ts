import { coordinates, distanceKm } from '../travel-assistant/places';
import type { Coordinates, Place, PointCategory } from '../travel-assistant/types';

// OpenFreeMap uses Planetiler's OSM IDs: osmId * 10 + 1/2/3.
// Do not treat an opaque tile feature ID as an OSM node ID.
export function openMapOsmIdentity(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 11) return null;
  const kind = ({ 1: 'node', 2: 'way', 3: 'relation' } as Record<number, string>)[value % 10];
  return kind ? `${kind}/${Math.floor(value / 10)}` : null;
}
const categories: Record<string, PointCategory> = {
  museum:'museum', hospital:'hospital', clinic:'hospital', pharmacy:'pharmacy', police:'police',
  atm:'atm', bank:'bank', bureau_de_change:'exchange', toilets:'toilets', embassy:'embassy',
  diplomatic:'embassy', cafe:'cafe', restaurant:'restaurant', fast_food:'restaurant', bakery:'bakery',
  ice_cream:'sweets', confectionery:'sweets', chocolate:'sweets', pastry:'sweets',
  boutique:'boutique', clothes:'boutique', clothing_store:'boutique', craft:'craft', gift:'gift',
  supermarket:'market', convenience:'market', marketplace:'market', food_market:'market',
  shop:'store', park:'park', garden:'garden', beach:'beach', viewpoint:'viewpoint',
  attraction:'attraction', castle:'historic', ruins:'historic', monument:'monument', memorial:'monument',
  palace:'palace', stadium:'stadium', square:'square', station:'transit', subway:'transit',
  bus_stop:'transit', bus_station:'transit', railway:'transit', bus:'transit', tram_stop:'transit',
};
const clean=(value:unknown)=>typeof value==='string'?value.replace(/<[^>]*>/g,' ').replace(/[<>\u0000-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim().slice(0,180):'';
const fold=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('tr');

/** Only real point features from already loaded POI tiles; no extra network request. */
export function openMapFeaturePlaces(features: unknown[], center: Coordinates, options: {
  category?: string; query?: string; locale?: string; fetchedAt?: string;
  bounds?: { west:number; south:number; east:number; north:number };
} = {}): Place[] {
  const result=new Map<string,Place>(),term=fold(options.query?.trim()||'');
  const stamp=options.fetchedAt||new Date().toISOString();
  if(!coordinates(center)||!Number.isFinite(Date.parse(stamp)))return [];
  for(const value of features.slice(0,20000)){
    if(!value||typeof value!=='object')continue;
    const feature=value as {id?:unknown;sourceLayer?:unknown;geometry?:{type?:unknown;coordinates?:unknown};properties?:Record<string,unknown>};
    if(feature.sourceLayer!==undefined&&feature.sourceLayer!=='poi'||feature.geometry?.type!=='Point'||!Array.isArray(feature.geometry.coordinates))continue;
    const id=openMapOsmIdentity(feature.id),p=coordinates({longitude:feature.geometry.coordinates[0],latitude:feature.geometry.coordinates[1]});
    if(!id||!p||result.has(id)||distanceKm(center,p)>3)continue;
    const b=options.bounds;if(b&&(p.longitude<b.west||p.longitude>b.east||p.latitude<b.south||p.latitude>b.north))continue;
    const tags=feature.properties||{},kind=categories[String(tags.subclass)]||categories[String(tags.class)];
    const locale=options.locale||'tr';
    const name=clean(tags[`name:${locale}`])||clean(tags[`name_${locale}`])||clean(tags.name)||clean(tags.name_en);
    if(!kind||!name||options.category&&options.category!=='all'&&kind!==options.category&&!(options.category==='store'&&['boutique','craft','gift','market'].includes(kind))||term&&!fold(name).includes(term))continue;
    result.set(id,{...p,id,name,category:kind,description:null,hours:null,free:null,accessible:null,website:null,representedCountry:null,sourceUrl:`https://www.openstreetmap.org/${id}`,fetchedAt:stamp});
  }
  return [...result.values()].sort((a,b)=>distanceKm(center,a)-distanceKm(center,b)).slice(0,250);
}
