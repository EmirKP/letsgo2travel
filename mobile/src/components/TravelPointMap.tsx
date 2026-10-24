import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Coordinates, Place } from '../../../lib/travel-assistant/types';
import { useI18n } from '../lib/i18n';
import { JourneyMap } from './JourneyMap';

type PointMapProps = {center:Coordinates; places:Place[]; onSelect:(place:Place)=>void; ownerId?:string|null};

export function TravelPointMap(props: PointMapProps) {
  return props.places.some(place => place.id.startsWith('apple/'))
    ? <ApplePointMap {...props}/> : <OpenStreetPointMap {...props}/>;
}

function ApplePointMap({ center, places, onSelect, ownerId }: PointMapProps) {
  const { copy } = useI18n();
  return <div className="ta-map"><JourneyMap center={center} ownerId={ownerId} stops={[]} discoveredPlaces={places}
    onSelectPlace={point => { const place = places.find(item => item.id === point.id); if (place) onSelect(place); }}
    labels={{map:copy('Yakındaki noktalar haritası','Nearby places map','Harta e vendeve pranë'),
      zoomIn:copy('Yakınlaştır','Zoom in','Zmadho'),zoomOut:copy('Uzaklaştır','Zoom out','Zvogëlo'),
      tilesUnavailable:copy('Harita yüklenemedi.','Map could not load.','Harta nuk u ngarkua.'),
      retryTiles:copy('Haritayı tekrar dene','Retry map','Provo hartën përsëri'),
      stop:(_order,_day,name)=>name,place:name=>name,
      cluster:count=>copy(`${count} yer`,`${count} places`,`${count} vende`)}}/></div>;
}

function OpenStreetPointMap({ center, places, onSelect }: PointMapProps) {
  const { copy } = useI18n();
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const selection = useRef(onSelect);
  const [tileError,setTileError] = useState(false);
  useEffect(() => { selection.current = onSelect; },[onSelect]);
  useEffect(() => {
    if (!element.current) return;
    const m = L.map(element.current, { scrollWheelZoom: false }).setView([center.latitude,center.longitude],14);
    map.current = m;
    // No prefetch/offline tile downloader. Browser honours provider cache headers.
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      referrerPolicy:'strict-origin-when-cross-origin', crossOrigin:true,
    }).addTo(m);
    tiles.on('tileerror', () => setTileError(true));
    const observer = new ResizeObserver(() => m.invalidateSize()); observer.observe(element.current);
    return () => { observer.disconnect(); m.remove(); map.current = null; };
  },[]);
  useEffect(() => { map.current?.setView([center.latitude,center.longitude],14); },[center.latitude,center.longitude]);
  useEffect(() => {
    const m = map.current; if (!m) return;
    const layer = L.layerGroup().addTo(m);
    function draw() {
      layer.clearLayers();
      const buckets = new Map<string,Place[]>();
      for (const p of places) {
        const projected = m!.project([p.latitude,p.longitude],m!.getZoom());
        const key = m!.getZoom() >= 18 ? p.id : `${Math.floor(projected.x/52)}:${Math.floor(projected.y/52)}`;
        buckets.set(key,[...(buckets.get(key)||[]),p]);
      }
      for (const group of buckets.values()) {
        const p = group[0]; const clustered = group.length > 1;
        const badge = document.createElement('span'); badge.className = 'ta-map-marker';
        badge.textContent = clustered ? String(group.length) : '•';
        const marker = L.marker([p.latitude,p.longitude], {
          title:clustered ? `${group.length}` : p.name || p.category,
          icon:L.divIcon({html:badge,className:'ta-map-marker-wrap',iconSize:[44,44],iconAnchor:[22,22]}),
        });
        marker.on('click',() => clustered ? m!.setView([p.latitude,p.longitude],Math.min(18,m!.getZoom()+2)) : selection.current(p));
        marker.addTo(layer);
      }
    }
    draw(); m.on('zoomend',draw);
    return () => { m.off('zoomend',draw); layer.remove(); };
  },[places]);
  return <><div className="ta-map" ref={element} aria-label={copy('Yakındaki noktalar haritası; aynı noktalar aşağıdaki erişilebilir listede bulunur.','Nearby places map; the same places appear in the accessible list below.')}/>
    {tileError && <p role="status">{copy('Harita zemini yüklenemedi. Aşağıdaki nokta listesini kullanabilirsin.','Map tiles unavailable. You can use the place list below.')}</p>}</>;
}
