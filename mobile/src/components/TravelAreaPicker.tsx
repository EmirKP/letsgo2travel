import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { coarseLocation } from '../../../lib/travel-assistant/places';
import type { Coordinates } from '../../../lib/travel-assistant/types';
import { useI18n } from '../lib/i18n';
import { Icon } from './Icon';
import './travel-tools-reliability.css';

import { TRAVEL_CENTRES } from '../lib/travelAreas';


/** Deliberate area selection: no location request or geocoding service required. */
export function TravelAreaPicker({ value, onChange, disabled = false }: {
  value: Coordinates | null; onChange: (point: Coordinates) => void; disabled?: boolean;
}) {
  const { copy } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const matching = TRAVEL_CENTRES.find(c => c.latitude === value?.latitude && c.longitude === value?.longitude);
  return <div className="ta-area-picker">
    <label>{copy('Konum paylaşmadan bölge seç', 'Choose an area without sharing location', 'Zgjidh zonën pa ndarë vendndodhjen')}
      <select disabled={disabled} value={matching?.name || ''} onChange={e => {
        const city = TRAVEL_CENTRES.find(c => c.name === e.target.value);
        if (city) onChange({ latitude: city.latitude, longitude: city.longitude });
      }}><option value="">{value ? copy('Haritada seçtiğin bölge', 'Area selected on map', 'Zona e zgjedhur në hartë') : copy('Şehir merkezi seç', 'Choose a city centre', 'Zgjidh qendrën e qytetit')}</option>
        {TRAVEL_CENTRES.map(c => <option key={c.name}>{c.name}</option>)}
      </select>
    </label>
    <button type="button" className="secondary-wide" disabled={disabled} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}><Icon name="map" size={18}/>{expanded ? copy('Bölge haritasını kapat', 'Close area map', 'Mbyll hartën e zonës') : copy('Başka bir bölgeyi haritada seç', 'Choose another area on the map', 'Zgjidh një zonë tjetër në hartë')}</button>
    {expanded && <>
      <p className="ta-muted">{copy('Haritayı kaydır, yakınlaştır ve istediğin merkeze dokun. Seçimin yaklaşık 1 km hassasiyetle kullanılır.', 'Move and zoom the map, then tap your centre. The selection is rounded to about 1 km.', 'Lëviz dhe zmadho hartën, pastaj prek qendrën. Zgjedhja rrumbullakohet në rreth 1 km.')}</p>
      <AreaMap value={value} disabled={disabled} onChange={onChange}/>
    </>}
    {value && <small role="status">{matching?.name || copy('Seçilen merkez', 'Selected centre', 'Qendra e zgjedhur')} · {value.latitude.toFixed(2)}, {value.longitude.toFixed(2)}</small>}
  </div>;
}

function AreaMap({ value, onChange, disabled }: { value: Coordinates | null; onChange: (value: Coordinates) => void; disabled: boolean }) {
  const { copy } = useI18n();
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const state = useRef({ onChange, disabled });
  const [failed, setFailed] = useState(false);
  useEffect(() => { state.current = { onChange, disabled }; }, [onChange, disabled]);
  useEffect(() => {
    if (!element.current) return;
    const m = L.map(element.current, { scrollWheelZoom: false, minZoom: 2, maxZoom: 17 }).setView(value ? [value.latitude, value.longitude] : [41.01, 28.98], value ? 12 : 4);
    map.current = m;
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', referrerPolicy: 'strict-origin-when-cross-origin' }).addTo(m);
    tiles.on('tileerror', () => setFailed(true));
    m.on('click', (event: L.LeafletMouseEvent) => {
      if (!state.current.disabled && Math.abs(event.latlng.lat) <= 85)
        state.current.onChange(coarseLocation({ latitude: event.latlng.lat, longitude: ((event.latlng.lng + 180) % 360 + 360) % 360 - 180 }));
    });
    const observer = new ResizeObserver(() => m.invalidateSize()); observer.observe(element.current);
    return () => { observer.disconnect(); m.remove(); map.current = null; marker.current = null; };
    // The map is initialized once; subsequent selections update its marker below.
  }, []);
  useEffect(() => {
    const m = map.current; if (!m || !value) return;
    const point: L.LatLngExpression = [value.latitude, value.longitude];
    if (marker.current) marker.current.setLatLng(point);
    else marker.current = L.circleMarker(point, { radius: 10, color: '#0066ff', fillColor: '#ffdd2d', fillOpacity: 1, weight: 3 }).addTo(m);
    m.setView(point, Math.max(m.getZoom(), 12), { animate: false });
  }, [value]);
  return <><div className="ta-map ta-area-map" ref={element} aria-label={copy('Bölge seçme haritası', 'Area selection map', 'Harta për zgjedhjen e zonës')}/>{failed && <p role="status" className="ta-warning">{copy('Harita görüntüsü yüklenemedi. Yukarıdaki şehir listesini kullanabilir veya bağlantını kontrol edebilirsin.', 'Map images could not load. Use the city list above or check your connection.', 'Harta nuk u ngarkua. Përdor listën e qyteteve ose kontrollo lidhjen.')}</p>}</>;
}
