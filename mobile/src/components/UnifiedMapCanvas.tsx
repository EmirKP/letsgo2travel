import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Map, Marker, NavigationControl, AttributionControl, addProtocol, setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Coordinates, Place } from '../../../lib/travel-assistant/types';
import type { OfflineMapPack } from '../../../lib/travel-assistant/offline-map';
import { loadOpenMapStyle, preparedMapStyle, resourceTransform, resolveMapResource, type OpenMapPack } from '../lib/openMapOffline';
import { getThemeSnapshot, subscribeTheme } from '../lib/theme';
import { useI18n } from '../lib/i18n';
import { Icon } from './Icon';
import { journeyMapCategory } from './journeyMapCategory';
import { openMapFeaturePlaces } from '../../../lib/maps/open-map-pois';
import { openMapAppearanceStyle, applyOpenMapAppearance } from '../lib/openMapAppearance';

setWorkerUrl(workerUrl);
addProtocol('l2t-map',(request,abort)=>resolveMapResource(request.url,abort.signal,request.type));
type Props={center:Coordinates;places:Place[];selectedId?:string;location?:Coordinates|null;route?:Array<[number,number]>;pack?:OpenMapPack|null;legacy?:OfflineMapPack|null;focusRequest:number;pinMode?:boolean;tileCategory?:string;tileQuery?:string;onTilePlaces?:(places:Place[])=>void;onSelect:(p:Place)=>void;onPoint:(p:Coordinates,name?:string)=>void;onMove:(p:Coordinates)=>void};
function markerIcon(place:Place) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [key,value] of Object.entries({viewBox:'0 0 24 24',width:'19',height:'19',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(key,value);
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',journeyMapCategory(place.id.startsWith('personal/')?null:place.category).path);svg.appendChild(path);return svg;
}
export function UnifiedMapCanvas(props:Props){
  const {copy,locale}=useI18n(),host=useRef<HTMLDivElement>(null),map=useRef<Map|null>(null),current=useRef(props),markers=useRef<Marker[]>([]),userMarker=useRef<Marker|null>(null);
  const publishTiles=useRef<()=>void>(()=>{});
  const originalStyle=useRef<StyleSpecification|null>(null);
  const [theme,setTheme]=useState(getThemeSnapshot),[ready,setReady]=useState(0),[error,setError]=useState(false),[retry,setRetry]=useState(0);
  useLayoutEffect(()=>{current.current=props;});
  useEffect(()=>subscribeTheme(()=>setTheme(getThemeSnapshot())),[]);
  const packId=props.pack?.id,legacyId=props.legacy?.id;
  useEffect(()=>{
    if(!host.current)return;let active=true;const controller=new AbortController();setError(false);setReady(0);
    void(async()=>{
      let style:StyleSpecification;
      if(current.current.legacy){const legacy=current.current.legacy;style={version:8,sources:{streets:{type:'geojson',data:{type:'FeatureCollection',features:legacy.roads.map(r=>({type:'Feature',properties:{name:r.name},geometry:{type:'LineString',coordinates:r.points.map(([lat,lon])=>[lon,lat])}}))}}},layers:[{id:'background',type:'background',paint:{'background-color':'#edf2ed'}},{id:'street-casing',type:'line',source:'streets',paint:{'line-color':'#d5dedb','line-width':7}},{id:'street',type:'line',source:'streets',paint:{'line-color':'#ffffff','line-width':4}}]};}
      else style=preparedMapStyle(current.current.pack?.style||await loadOpenMapStyle(controller.signal),packId);
      if(!active||!host.current)return;
      originalStyle.current=style;
      style=openMapAppearanceStyle(style,getThemeSnapshot().resolved);
      const m=new Map({container:host.current,style,locale:{'NavigationControl.ZoomIn':copy('Yakınlaştır','Zoom in','Zmadho'),'NavigationControl.ZoomOut':copy('Uzaklaştır','Zoom out','Zvogëlo'),'AttributionControl.ToggleAttribution':copy('Harita kaynakları','Map sources','Burimet e hartës')},center:[current.current.center.longitude,current.current.center.latitude],zoom:14,minZoom:packId?10:2,maxZoom:19,attributionControl:false,transformRequest:url=>resourceTransform(url,packId),...(current.current.pack?{maxBounds:[[current.current.pack.bounds.west,current.current.pack.bounds.south],[current.current.pack.bounds.east,current.current.pack.bounds.north]] as [[number,number],[number,number]]}:{}),cooperativeGestures:false});map.current=m;
      m.addControl(new NavigationControl({showCompass:false}),'bottom-right');m.addControl(new AttributionControl({compact:true,customAttribution:'<a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>'}),'bottom-left');
      let loaded=false;
      m.on('load',()=>{loaded=true;if(active){setReady(v=>v+1);if(!failedSources.size)setError(false);}});
      // Match the exact recovered tile. Idle, or a different successful tile,
      // must not hide a still-failed resource in the same source.
      const failedSources=new Set<string>();
      m.on('sourcedata',event=>{const key=event.tile?.tileID?.key??event.coord?.key;if(active&&event.sourceId&&key!==undefined&&event.tile?.state==='loaded'&&failedSources.delete(`${event.sourceId}:${key}`)&&!failedSources.size&&m.isStyleLoaded())setError(false);});
      m.on('error',event=>{const tile='tile'in event?event.tile as {tileID?:{key?:unknown}}:undefined;const key=tile?.tileID?.key;if('sourceId'in event&&typeof event.sourceId==='string'&&key!==undefined)failedSources.add(`${event.sourceId}:${key}`);else if(loaded)failedSources.add('unknown');if(active)setError(true);if(import.meta.env.DEV)console.warn('travel_map_resource_error',event.error?.message?.replace(/https?:\/\/\S+/g,'[map resource]'));});
      publishTiles.current=()=>{
        if(!active||current.current.pack||current.current.legacy||!current.current.onTilePlaces||!m.isStyleLoaded())return;
        try{
          const features:unknown[]=[];
          for(const [id,source]of Object.entries(m.getStyle().sources))if(source.type==='vector'){
            features.push(...m.querySourceFeatures(id,{sourceLayer:'poi',filter:['has','name']}).slice(0,20000-features.length));
            if(features.length>=20000)break;
          }
          const bounds=m.getBounds(),c=m.getCenter();
          current.current.onTilePlaces(openMapFeaturePlaces(features,{latitude:c.lat,longitude:c.lng},{category:current.current.tileCategory,query:current.current.tileQuery,locale,bounds:{west:bounds.getWest(),east:bounds.getEast(),south:bounds.getSouth(),north:bounds.getNorth()}}));
        }catch{/* A POI fallback must never interrupt the base map. */}
      };
      m.on('idle',()=>publishTiles.current());
      m.on('moveend',()=>{const c=m.getCenter();current.current.onMove({latitude:c.lat,longitude:c.lng});});
      m.on('click',e=>{if(!current.current.pinMode)return;const features=m.queryRenderedFeatures(e.point);const name=features.find(f=>typeof f.properties?.name==='string')?.properties?.name;current.current.onPoint({latitude:e.lngLat.lat,longitude:e.lngLat.lng},typeof name==='string'?name:undefined);});
    })().catch(()=>{if(active)setError(true);});
    return()=>{active=false;publishTiles.current=()=>{};originalStyle.current=null;controller.abort();markers.current.forEach(m=>m.remove());markers.current=[];userMarker.current?.remove();userMarker.current=null;map.current?.remove();map.current=null;};
  },[packId,legacyId,retry,locale]);
  useEffect(()=>{const m=map.current,style=originalStyle.current;if(m&&style&&ready&&m.isStyleLoaded())applyOpenMapAppearance(m,style,theme.resolved);},[theme.resolved,ready]);
  useEffect(()=>{if(ready)publishTiles.current();},[ready,props.tileCategory,props.tileQuery]);
  useEffect(()=>{const m=map.current;if(!m||!ready)return;m.easeTo({center:[props.center.longitude,props.center.latitude],zoom:Math.max(m.getZoom(),14),duration:400});},[props.center.latitude,props.center.longitude,props.focusRequest,ready]);
  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;markers.current.forEach(p=>p.remove());
    markers.current=props.places.slice(0,350).map(p=>{const button=document.createElement('button');button.type='button';button.className=`um-map-pin ${p.id===props.selectedId?'selected':''} ${p.id.startsWith('personal/')?'personal':''}`;const label=p.name||journeyMapCategory(p.category,locale).label;button.setAttribute('aria-label',label);button.title=label;button.appendChild(markerIcon(p));button.onclick=e=>{e.stopPropagation();current.current.onSelect(p);};return new Marker({element:button,anchor:'bottom'}).setLngLat([p.longitude,p.latitude]).addTo(m);});
    return()=>{markers.current.forEach(p=>p.remove());markers.current=[];};
  },[props.places,props.selectedId,ready,locale]);
  useEffect(()=>{const m=map.current;if(!m||!ready)return;if(!props.location||!Number.isFinite(props.location.longitude)||!Number.isFinite(props.location.latitude)){userMarker.current?.remove();userMarker.current=null;return;}const point=[props.location.longitude,props.location.latitude] as [number,number];if(!userMarker.current){const element=document.createElement('div');element.className='um-user-location';element.setAttribute('role','img');element.setAttribute('aria-label',copy('Konumun','Your location','Vendndodhja jote'));userMarker.current=new Marker({element}).setLngLat(point).addTo(m);}else userMarker.current.setLngLat(point);},[props.location,ready,copy]);
  useEffect(()=>{const m=map.current;if(!m||!ready)return;if(m.getLayer('user-route'))m.removeLayer('user-route');if(m.getSource('user-route'))m.removeSource('user-route');if(!props.route?.length)return;m.addSource('user-route',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:props.route}}});m.addLayer({id:'user-route',type:'line',source:'user-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#0868f8','line-width':6,'line-opacity':.86}});const xs=props.route.map(p=>p[0]),ys=props.route.map(p=>p[1]);m.fitBounds([[Math.min(...xs),Math.min(...ys)],[Math.max(...xs),Math.max(...ys)]],{padding:45,maxZoom:16,duration:400});},[props.route,ready]);
  return <div className="um-canvas-wrap"><div ref={host} className={`um-canvas ${props.pinMode?'pin-mode':''}`} role="region" aria-label={copy('Gezi ve ihtiyaç haritası','Travel and essentials map','Harta e udhëtimit dhe nevojave')}/>{!ready&&!error&&<div className="um-map-loading" role="status"><span className="button-loader dark"/>{copy('Harita açılıyor…','Opening map…','Po hapet harta…')}</div>}{error&&<div className="um-map-error" role="status"><span>{copy('Bazı harita verileri yüklenemedi.','Some map data could not load.','Disa të dhëna të hartës nuk u ngarkuan.')}</span><button type="button" onClick={()=>setRetry(v=>v+1)}><Icon name="refresh" size={15}/>{copy('Tekrar dene','Retry','Provo sërish')}</button></div>}</div>;
}
