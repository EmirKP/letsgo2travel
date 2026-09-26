import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_LABELS, NEEDS, TOURING, distanceKm, filterPlaces } from '../../../lib/travel-assistant/places';
import type { Coordinates, MapMode, Place, PlacesResult } from '../../../lib/travel-assistant/types';
import { loadPlaces, locateForTravel, directionsUrl } from '../lib/travelAssistant';
import { useI18n } from '../lib/i18n';
import { openExternal } from '../lib/native';
import { Sheet } from './Sheet';
import { validatePlaces } from '../../../lib/travel-assistant/responses';
import { useCurrentTime } from '../hooks/useCurrentTime';
const TravelPointMap = lazy(() => import('./TravelPointMap').then(m => ({default:m.TravelPointMap})));
const CITY_CENTRES = [
  { name:'Berlin', latitude:52.52, longitude:13.40 },
  { name:'İstanbul', latitude:41.01, longitude:28.98 },
  { name:'Paris', latitude:48.86, longitude:2.35 },
  { name:'Tokyo', latitude:35.68, longitude:139.76 },
  { name:'Roma', latitude:41.90, longitude:12.50 },
  { name:'London', latitude:51.51, longitude:-0.13 },
];

export function TravelNearby({mode,citizenship}: {mode:MapMode;citizenship:string}) {
  const { copy, locale } = useI18n();
  const [center,setCenter] = useState<Coordinates|null>(null);
  const [savedResult,setResult] = useState<PlacesResult|null>(null);
  const now = useCurrentTime();
  const result = useMemo(() => savedResult && center ? validatePlaces(savedResult, center, mode, now) : null, [savedResult, center, mode, now]);
  const [category,setCategory] = useState(''); const [free,setFree] = useState(false); const [accessible,setAccessible] = useState(false); const [alwaysOpen,setAlwaysOpen] = useState(false);
  const [myEmbassy,setMyEmbassy] = useState(false);
  const [city,setCity] = useState('');
  const [busy,setBusy] = useState(false); const [error,setError] = useState(''); const [selected,setSelected] = useState<Place|null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; },[]);
  const name = (p:Place) => p.name || CATEGORY_LABELS[p.category][locale === 'tr' ? 0 : 1];
  const filtered = useMemo(() => result && center && (!myEmbassy || citizenship) ? filterPlaces(result.places,{category,free,accessible,alwaysOpen,representedCountry:myEmbassy ? citizenship : undefined},center) : [],[result,center,category,free,accessible,alwaysOpen,myEmbassy,citizenship]);
  async function search(chosen?: Coordinates) {
    const id = ++generation.current;
    setBusy(true); setError(''); setSelected(null); setResult(null);
    try {
      const c = chosen || await locateForTravel();
      if (id !== generation.current) return;
      setCenter(c);
      const data = await loadPlaces(c,mode);
      if (id === generation.current) setResult(data);
    } catch(error) {
      if (id !== generation.current) return;
      setError(error instanceof Error && error.message === 'denied'
        ? copy('Konum izni verilmedi. Ayarlardan izin verebilirsin; acil numaralar konum istemeden kullanılabilir.','Location permission denied. You can allow it in Settings; emergency numbers do not need location.')
        : error instanceof Error && error.message === 'unavailable'
          ? copy('Konum alınamadı. Şehir merkezi seçebilir veya cihaz konum ayarını kontrol edebilirsin.','Location unavailable. Choose a city centre or check device location settings.')
          : copy('Yakındaki noktalar şu anda alınamadı. Bağlantını kontrol edip tekrar dene; acil numaralar çevrimdışı kullanılabilir.','Nearby places are unavailable. Check your connection and retry; emergency numbers remain available offline.'));
    } finally { if(id === generation.current) setBusy(false); }
  }
  return <section className="ta-panel"><h3>{mode === 'needs' ? copy('Acil & İhtiyaç Haritası','Emergency & essentials map') : copy('Gezi & Tur Rehberi Haritası','Sightseeing map')}</h3>
    <p className="ta-muted">{copy('Butona basınca yaklaşık konumun (~1 km) yakındaki noktaları bulmak için sunucuya iletilir. Harita açıldığında harita sağlayıcısı görüntülenen bölgeyi ve IP adresini görebilir. Konum geçmişi tutmayız.','Tapping requests approximate location (~1 km) to find nearby places through our server. The map provider can see the viewed area and IP address when the map opens. We keep no location history.')}</p>
    <button type="button" className="primary-wide" onClick={() => void search()} disabled={busy}>{busy ? copy('Yakınım aranıyor…','Searching nearby…') : copy('Konumumla yakınları bul','Find places near me')}</button>
    <div className="ta-form-row"><label>{copy('Konum paylaşmadan şehir merkezi seç','Choose a city centre without sharing location')}<select value={city} disabled={busy} onChange={e=>setCity(e.target.value)}><option value="">{copy('Şehir seç','Choose city')}</option>{CITY_CENTRES.map(c=><option key={c.name}>{c.name}</option>)}</select></label></div>
    <button type="button" className="secondary-wide" disabled={busy || !city} onClick={()=>void search(CITY_CENTRES.find(c=>c.name===city))}>{copy('Seçili şehir merkezini göster','Show selected city centre')}</button>
    {error && <p role="alert" className="ta-empty">{error}</p>}
    {savedResult && !result && <p role="status" className="ta-warning">{copy('Son harita sonucunun kullanım süresi doldu. Noktaları yeniden yükle.', 'The last map result has expired. Load places again.')}</p>}
    <div className="ta-form-row"><label>{copy('Kategori','Category')}<select value={category} onChange={e => setCategory(e.target.value)}><option value="">{copy('Tümü','All')}</option>{(mode === 'needs' ? NEEDS : TOURING).map(c => <option value={c} key={c}>{CATEGORY_LABELS[c][locale === 'tr' ? 0 : 1]}</option>)}</select></label></div>
    <div className="ta-filters"><label><input type="checkbox" checked={free} onChange={e => setFree(e.target.checked)}/>{copy('Ücretsiz olduğu belirtilen','Marked free')}</label><label><input type="checkbox" checked={accessible} onChange={e => setAccessible(e.target.checked)}/>{copy('Tekerlekli sandalye erişimi','Wheelchair access')}</label><label><input type="checkbox" checked={alwaysOpen} onChange={e => setAlwaysOpen(e.target.checked)}/>{copy('24 saat açık kaydı','Listed 24/7')}</label>{mode === 'needs' && <label><input type="checkbox" checked={myEmbassy} onChange={e => {setMyEmbassy(e.target.checked); if(e.target.checked) setCategory('embassy');}}/>{copy('Yalnız vatandaşlığımın temsilcilikleri','Only my country’s missions')}</label>}</div>
    <p className="ta-muted">{copy('Saat ve ücretsiz/erişilebilir bilgisi eksikse filtreye dahil edilmez. “Şimdi açık” bilgisi, saat dilimi ve tatiller doğrulanmadan tahmin edilmez.','Missing fee/access/hour data are excluded by filters. “Open now” is not guessed without verified time zone and holiday data.')}</p>
    {result && center && <><p aria-live="polite">{filtered.length} {copy('nokta','places')} · {copy('Aranan merkez çevresinde yaklaşık 3 km; merkeze mesafeye göre','About 3 km around the searched centre; sorted by distance from centre')}</p>
      {result.stale && <p className="ta-warning" role="status">{copy('Güncel veri alınamadı veya son sonuç bir saatten eski. Aynı bölgenin en son alınan kaydı gösteriliyor; hizmet ve saatler değişmiş olabilir. Harita görüntüsü internet gerektirebilir.', 'Fresh data is unavailable or the last result is over an hour old. Showing the last retrieved result for this area; services and hours may have changed. Map images may need internet.')}</p>}
      <button type="button" className="secondary-wide" disabled={busy} onClick={() => void search(center)}>{copy('Bu bölgeyi yenile', 'Refresh this area')}</button>
      {filtered.length > 0 && <Suspense fallback={<p role="status">{copy('Harita yükleniyor…','Loading map…')}</p>}><TravelPointMap center={center} places={filtered} onSelect={setSelected}/></Suspense>}
      {!filtered.length && <p className="ta-empty">{copy('Bu filtrelerde kayıt bulunamadı. Bu, çevrende hizmet olmadığı anlamına gelmez; filtreleri kaldır veya harita uygulamasında ara.','No records match these filters. This does not mean no service exists nearby; clear filters or search in your maps app.')}</p>}
      <div className="ta-place-list">{filtered.map(p => <button type="button" key={p.id} onClick={() => setSelected(p)}><span><strong>{name(p)}</strong><small>{CATEGORY_LABELS[p.category][locale === 'tr' ? 0 : 1]}</small></span><small>≈ {distanceKm(center,p).toFixed(1)} km</small></button>)}</div>
      <p className="ta-muted">{copy('OSM topluluk verisi; doğruluk ve hizmet mevcudiyeti garanti değildir. Mesafeler kuş uçuşudur.','OSM community data; accuracy and service availability are not guaranteed. Distances are straight-line estimates.')} {copy('Alınma','Retrieved')}: {new Date(result.fetchedAt).toLocaleString(locale)}{result.limited && ` · ${copy('Sonuç sınırına ulaşıldı; tüm noktalar gösterilmiyor.','Result limit reached; not all places are shown.')}`}</p></>}
    <Sheet open={!!selected && !!result} title={selected ? name(selected) : ''} onClose={() => setSelected(null)}>{selected && result && <div className="ta-panel">
      <p>{selected.description || copy('Bu nokta için kısa açıklama bulunmuyor.','No description is available for this place.')}</p>
      {center && <p>≈ {distanceKm(center,selected).toFixed(1)} km</p>}
      <p>{copy('Çalışma saati kaydı','Listed hours')}: {selected.hours || copy('Bilinmiyor','Unknown')}</p>
      <p>{selected.hours === '24/7' ? copy('24 saat açık olarak kayıtlı; geçici kapanış olabilir.','Listed 24/7; temporary closures are possible.') : copy('Şu an açık/kapalı durumu doğrulanmadı.','Current open/closed status is not verified.')}</p>
      <div className="ta-actions"><button type="button" onClick={() => void openExternal(directionsUrl(`${selected.latitude},${selected.longitude}`))}>{copy('Yol tarifi','Directions')}</button>{selected.website && <button type="button" onClick={() => void openExternal(selected.website!)}>{copy('Kayıttaki web sitesi','Listed website')}</button>}<button type="button" onClick={() => void openExternal(selected.sourceUrl)}>{copy('OSM kaynağı','OSM source')}</button></div>
    </div>}</Sheet>
  </section>;
}
