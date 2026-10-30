import { translateTuple } from "../lib/locale";
import { formatAppDate } from "../lib/localeFormatting";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_LABELS, NEEDS, TOURING, distanceKm, filterPlaces } from '../../../lib/travel-assistant/places';
import type { Coordinates, MapMode, Place, PlacesResult } from '../../../lib/travel-assistant/types';
import { loadPlaces, locateForTravel, directionsUrl } from '../lib/travelAssistant';
import { useI18n } from '../lib/i18n';
import { openExternal } from '../lib/native';
import { Sheet } from './Sheet';
import { validatePlaces } from '../../../lib/travel-assistant/responses';
import { useCurrentTime } from '../hooks/useCurrentTime';
import { MAX_SAVED_PLACES, removeTravelPlaceWithUndo, restoreTravelPlace, readSavedPlaces, saveTravelPlace, subscribeSavedPlaces, type RemovedTravelPlace } from '../lib/savedPlaces';
import { Icon } from './Icon';
import './saved-places.css';
import { TravelAreaPicker } from './TravelAreaPicker';
const TravelPointMap = lazy(() => import('./TravelPointMap').then(m => ({default:m.TravelPointMap})));


export function TravelNearby({mode,citizenship,ownerId,destinationCountry='',onEmbassies}: {mode:MapMode;citizenship:string;ownerId?:string|null;destinationCountry?:string;onEmbassies?:()=>void}) {
  const { copy, locale } = useI18n();
  const [center,setCenter] = useState<Coordinates|null>(null);
  const [savedResult,setResult] = useState<PlacesResult|null>(null);
  const now = useCurrentTime();
  const result = useMemo(() => savedResult && center ? validatePlaces(savedResult, center, mode, now) : null, [savedResult, center, mode, now]);
  const [category,setCategory] = useState(''); const [free,setFree] = useState(false); const [accessible,setAccessible] = useState(false); const [alwaysOpen,setAlwaysOpen] = useState(false);
  const [myEmbassy,setMyEmbassy] = useState(false);
  const [area,setArea] = useState<Coordinates|null>(null);
  const [choosingArea,setChoosingArea] = useState(false);
  const [busy,setBusy] = useState(false); const [error,setError] = useState(''); const [selected,setSelected] = useState<Place|null>(null);
  const [savedPlaces,setSavedPlaces] = useState(() => readSavedPlaces(ownerId));
  const [saveError,setSaveError] = useState(''); const [saveStatus,setSaveStatus] = useState('');
  const [removed,setRemoved] = useState<RemovedTravelPlace|null>(null);
  useEffect(() => { setSavedPlaces(readSavedPlaces(ownerId)); return subscribeSavedPlaces(() => setSavedPlaces(readSavedPlaces(ownerId)), ownerId); }, [ownerId]);
  const isSelectedSaved = !!selected && savedPlaces.items.some(item => item.place.id === selected.id);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; },[]);
  const name = (p:Place) => p.name || translateTuple(locale, CATEGORY_LABELS[p.category]);
  const apple = result?.attribution === 'Apple Maps';
  const appleUnsupported = ['exchange','wifi','embassy','statue','palace','square','viewpoint'];
  const unsupportedCategory = apple && appleUnsupported.includes(category);
  const filtered = useMemo(() => result && center && (apple || !myEmbassy || citizenship) ? filterPlaces(result.places,{category:unsupportedCategory ? '' : category,free:!apple && free,accessible:!apple && accessible,alwaysOpen:!apple && alwaysOpen,representedCountry:!apple && myEmbassy ? citizenship : undefined},center) : [],[result,center,category,free,accessible,alwaysOpen,myEmbassy,citizenship,apple,unsupportedCategory]);
  const searchInMaps = () => center && void openExternal(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${({exchange:'currency exchange',wifi:'public wifi',embassy:'embassy consulate'} as Record<string,string>)[category] || category || (mode === 'needs' ? 'pharmacy hospital' : 'sights')} near ${center.latitude},${center.longitude}`)}`);
  function selectPlace(place: Place) { setSelected(place); setSaveError(''); setSaveStatus(''); }
  function toggleSaved() {
    if (!selected) return;
    try {
      const saved = readSavedPlaces(ownerId).items.some(item => item.place.id === selected.id);
      if (saved) {
        const removal = removeTravelPlaceWithUndo(selected.id, ownerId);
        setSavedPlaces(removal.state); setRemoved(removal.removed);
      } else {
        setSavedPlaces(removed && removed.ownerId === (ownerId || null) && removed.item.place.id === selected.id ? restoreTravelPlace(removed, ownerId) : saveTravelPlace(selected, ownerId));
        setRemoved(null);
      }
      setSaveError('');
      setSaveStatus(saved
        ? ownerId ? copy('Bu yer cihazdaki kayıtlarından ve gezi sırandan kaldırıldı. Silme işlemi hesabınla eşitlenecek.', 'Removed from saved places and your day list on this device. The removal is queued for account sync.', 'Vendi u hoq nga vendet e ruajtura dhe rendi i vizitave në këtë pajisje. Heqja pret sinkronizimin me llogarinë.') : copy('Bu yer kayıtlı yerlerinden ve gezi sırandan kaldırıldı.', 'Removed from saved places and your day list.', 'Vendi u hoq nga vendet e ruajtura dhe rendi i vizitave.')
        : copy('Kaydedildi. Kaydettiğim yerler bölümünde not ekleyip gezi sırana alabilirsin.', 'Saved. Add notes and arrange your day in Saved places.'));
    } catch (e) {
      setSaveStatus('');
      const code = e instanceof Error ? e.message : '';
      setSaveError(code === 'full'
        ? copy(`En fazla ${MAX_SAVED_PLACES} yer kaydedebilirsin. Önce kayıtlı yerlerinden birini kaldır.`, `You can save up to ${MAX_SAVED_PLACES} places. Remove one of your saved places first.`)
        : code === 'corrupt'
          ? copy('Kayıtlı listen okunamıyor. Kaydettiğim yerler bölümünden kontrol et; mevcut verilerin silinmedi.', 'Your saved list cannot be read. Check Saved places; your existing data has not been deleted.')
          : copy('Değişiklik kaydedilemedi. Cihaz depolamasını kontrol et; önceki kayıtların korunuyor.', 'Could not save the change. Check device storage; your previous records are preserved.'));
    }
  }
  function undoRemoval() {
    if (!removed) return;
    try { setSavedPlaces(restoreTravelPlace(removed, ownerId)); setRemoved(null); setSaveError(''); setSaveStatus(copy('Yer, notun ve gezi sıran geri alındı.', 'Place, note and day position restored.', 'Vendi, shënimi dhe rendi i vizitës u rikthyen.')); }
    catch { setSaveError(copy('Yer geri alınamadı. Depolamayı ve liste sınırını kontrol edip yeniden dene.', 'Could not restore the place. Check storage and list limits, then retry.', 'Vendi nuk u rikthye. Kontrollo ruajtjen dhe kufijtë e listës, pastaj provo sërish.')); }
  }
  async function search(chosen?: Coordinates, refresh = false) {
    const id = ++generation.current;
    setBusy(true); setError(''); setSelected(null);
    try {
      const c = chosen || await locateForTravel();
      if (id !== generation.current) return;
      if (!center || center.latitude !== c.latitude || center.longitude !== c.longitude) setResult(null);
      setCenter(c); setArea(c);
      const data = await loadPlaces(c,mode,{refresh});
      if (id === generation.current) { setResult(data); setChoosingArea(false); }
    } catch(error) {
      if (id !== generation.current) return;
      setError(error instanceof Error && error.message === 'denied'
        ? copy('Konum izni verilmedi. Ayarlardan izin verebilirsin; acil numaralar konum istemeden kullanılabilir.','Location permission denied. You can allow it in Settings; emergency numbers do not need location.')
        : error instanceof Error && error.message === 'unavailable'
          ? copy('Konum alınamadı. Şehir merkezi seçebilir veya cihaz konum ayarını kontrol edebilirsin.','Location unavailable. Choose a city centre or check device location settings.')
          : copy('Yakındaki noktalar şu anda alınamadı. Bağlantını kontrol edip tekrar dene; acil numaralar çevrimdışı kullanılabilir.','Nearby places are unavailable. Check your connection and retry; emergency numbers remain available offline.'));
    } finally { if(id === generation.current) setBusy(false); }
  }
  const undoNotice = removed && removed.ownerId === (ownerId || null) && <div className="tsp-undo" role="status"><span>{copy('Yer, notu ve gezi sırasından kaldırıldı.', 'Place, note and day position removed.', 'Vendi, shënimi dhe rendi i vizitës u hoqën.')}</span><button type="button" onClick={undoRemoval}>{copy('Geri al','Undo','Zhbëj')}</button><button type="button" aria-label={copy('Geri almayı kapat','Dismiss undo','Mbyll zhbërjen')} onClick={() => setRemoved(null)}><Icon name="close" size={17}/></button></div>;
  return <section className="ta-panel"><h3>{mode === 'needs' ? copy('Acil & İhtiyaç Haritası','Emergency & essentials map') : copy('Gezi & Tur Rehberi Haritası','Sightseeing map')}</h3>
    <p className="ta-muted">{copy('Önce şehir veya bölge seç, sonra o bölgede ara. Konumun yalnız “Konumumla yakınları bul” seçeneğinde kullanılır; yaklaşık konum (~1 km) kullanılır ve konum geçmişi tutulmaz.', 'Choose a city or area, then search there. Your location is used only when you choose “Find places near me”; it is approximate (~1 km) and no location history is kept.', 'Zgjidh qytetin ose zonën, pastaj kërko aty. Vendndodhja përdoret vetëm kur zgjedh “Gjej vende pranë meje”; është e përafërt (~1 km) dhe nuk ruhet historik.')}</p>
    <TravelAreaPicker country={destinationCountry} value={area} mapOpen={choosingArea} onMapOpenChange={setChoosingArea} onChange={point => {generation.current++;setBusy(false);setArea(point);setResult(null);setSelected(null);setError('');}}/>
    <button type="button" className="primary-wide" disabled={busy || !area} onClick={()=>area && void search(area)}>{copy('Seçili bölgede ara','Search selected area','Kërko në zonën e zgjedhur')}</button>
    <button type="button" className="secondary-wide" onClick={() => void search()} disabled={busy}>{busy ? copy('Yakınım aranıyor…','Searching nearby…') : copy('Konumumla yakınları bul','Find places near me')}</button>
    {error && <p role="alert" className="ta-empty">{error}</p>}
    {busy && <p role="status" className="ta-tools-status">{copy('Bölgedeki kayıtlar yükleniyor…', 'Loading places in this area…', 'Po ngarkohen vendet në këtë zonë…')}</p>}
    {error && center && <div className="ta-retry-actions"><button type="button" disabled={busy} onClick={() => void search(center,true)}>{copy('Aynı bölgeyi tekrar dene', 'Retry this area', 'Provo sërish këtë zonë')}</button><button type="button" onClick={() => void openExternal(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${category || (mode === 'needs' ? 'pharmacy hospital' : 'sights')} near ${center.latitude},${center.longitude}`)}`)}>{copy('Harita uygulamasında ara', 'Search in maps', 'Kërko në hartë')}</button></div>}
    {savedResult && !result && <p role="status" className="ta-warning">{copy('Son harita sonucunun kullanım süresi doldu. Noktaları yeniden yükle.', 'The last map result has expired. Load places again.')}</p>}
    <div className="ta-form-row"><label>{copy('Kategori','Category')}<select value={unsupportedCategory ? '' : category} onChange={e => setCategory(e.target.value)}><option value="">{copy('Tümü','All')}</option>{(mode === 'needs' ? NEEDS : TOURING).map(c => <option value={c} key={c} disabled={apple && appleUnsupported.includes(c)}>{translateTuple(locale, CATEGORY_LABELS[c])}{apple && appleUnsupported.includes(c) ? copy(' · Bu kaynakta ayrı aranamaz', ' · Not separately searchable here', ' · Nuk kërkohet veçmas këtu') : ''}</option>)}</select></label></div>
    <div className="ta-filters"><label><input type="checkbox" disabled={apple} checked={!apple && free} onChange={e => setFree(e.target.checked)}/>{copy('Ücretsiz olduğu belirtilen','Marked free')}</label><label><input type="checkbox" disabled={apple} checked={!apple && accessible} onChange={e => setAccessible(e.target.checked)}/>{copy('Tekerlekli sandalye erişimi','Wheelchair access')}</label><label><input type="checkbox" disabled={apple} checked={!apple && alwaysOpen} onChange={e => setAlwaysOpen(e.target.checked)}/>{copy('24 saat açık kaydı','Listed 24/7')}</label>{mode === 'needs' && <label><input type="checkbox" disabled={apple} checked={!apple && myEmbassy} onChange={e => {setMyEmbassy(e.target.checked); if(e.target.checked) setCategory('embassy');}}/>{copy('Yalnız vatandaşlığımın temsilcilikleri','Only my country’s missions')}</label>}</div>
    <p className="ta-muted">{apple ? copy('Apple Maps bu sonuçlarda ücret, erişilebilirlik, 24 saat ve temsil edilen ülke bilgisi sağlamıyor; bu filtreler uygulanmaz. Gri kategoriler bu kaynakta ayrı aranamaz. Diğer noktalar aşağıda gösterilir.', 'Apple Maps does not supply fee, accessibility, 24-hour or represented-country information for these results, so those filters are unavailable. Grey categories cannot be searched separately here. Other places remain visible below.', 'Apple Maps nuk jep tarifa, aksesueshmëri, orare 24-orëshe ose shtetin e përfaqësuar; këta filtra nuk zbatohen. Kategoritë gri nuk kërkohen veçmas këtu. Vendet e tjera mbeten të dukshme.') : copy('Saat ve ücretsiz/erişilebilir bilgisi eksikse filtreye dahil edilmez. “Şimdi açık” bilgisi, saat dilimi ve tatiller doğrulanmadan tahmin edilmez.','Missing fee/access/hour data are excluded by filters. “Open now” is not guessed without verified time zone and holiday data.')}</p>
    {unsupportedCategory && filtered.length > 0 && <div className="ta-warning" role="status"><p>{copy('Bu kaynak seçtiğin kategoriyi ayrı kapsamıyor. Tüm noktalar gösteriliyor; kategoriyi harita uygulamasında arayabilirsin.', 'This source does not cover the selected category separately. Showing all places; you can search this category in your maps app.', 'Ky burim nuk e mbulon veçmas kategorinë. Shfaqen të gjitha vendet; kërko kategorinë në aplikacionin e hartës.')}</p>{category === 'embassy' && onEmbassies && <button type="button" className="secondary-wide" onClick={onEmbassies}>{copy('Konsolosluk bilgilerini aç','Open consulate information','Hap informacionin e konsullatës')}</button>}<button type="button" className="secondary-wide" onClick={searchInMaps}>{copy('Harita uygulamasında ara','Search in maps','Kërko në hartë')}</button></div>}
    {result && center && <><p aria-live="polite">{filtered.length} {copy('nokta','places')} · {copy('Aranan merkez çevresinde yaklaşık 3 km; merkeze mesafeye göre','About 3 km around the searched centre; sorted by distance from centre')}</p>
      {apple && mode === 'needs' && onEmbassies && !unsupportedCategory && <button type="button" className="secondary-wide" onClick={onEmbassies}>{copy('Konsolosluk bilgilerini aç','Open consulate information','Hap informacionin e konsullatës')}</button>}
      {result.stale && <p className="ta-warning" role="status">{copy('Güncel veri alınamadı veya son sonuç bir saatten eski. Aynı bölgenin en son alınan kaydı gösteriliyor; hizmet ve saatler değişmiş olabilir. Harita görüntüsü internet gerektirebilir.', 'Fresh data is unavailable or the last result is over an hour old. Showing the last retrieved result for this area; services and hours may have changed. Map images may need internet.')}</p>}
      <button type="button" className="secondary-wide" disabled={busy} onClick={() => void search(center,true)}>{copy('Bu bölgeyi yenile', 'Refresh this area')}</button>
      {filtered.length > 0 && !choosingArea && <Suspense fallback={<p role="status">{copy('Harita yükleniyor…','Loading map…')}</p>}><TravelPointMap center={center} places={filtered} onSelect={selectPlace} ownerId={ownerId}/></Suspense>}
      {!filtered.length && <div className="ta-empty"><p>{unsupportedCategory
        ? copy('Bu veri kaynağı seçtiğin kategoriyi kapsamıyor. Bölgedeki yerleri harita uygulamasında arayabilirsin.', 'This data source does not cover the selected category. Search for places in your maps app.', 'Ky burim nuk mbulon kategorinë e zgjedhur. Kërko vendet në aplikacionin e hartës.')
        : copy('Bu filtrelerde kayıt bulunamadı. Bu, çevrende hizmet olmadığı anlamına gelmez; filtreleri kaldır veya harita uygulamasında ara.','No records match these filters. This does not mean no service exists nearby; clear filters or search in your maps app.')}</p>
        {category === 'embassy' && onEmbassies && <button className="secondary-wide" type="button" onClick={onEmbassies}>{copy('Konsolosluk bilgilerini aç','Open consulate information','Hap informacionin e konsullatës')}</button>}
        <button className="secondary-wide" type="button" onClick={searchInMaps}>{copy('Harita uygulamasında ara','Search in maps','Kërko në hartë')}</button>
        <button className="secondary-wide" type="button" onClick={() => {setCategory('');setFree(false);setAccessible(false);setAlwaysOpen(false);setMyEmbassy(false);}}>{copy('Filtreleri temizle','Clear filters','Pastro filtrat')}</button></div>}
      <div className="ta-place-list">{filtered.map(p => <button type="button" key={p.id} onClick={() => selectPlace(p)}><span><strong>{name(p)}</strong><small>{translateTuple(locale, CATEGORY_LABELS[p.category])}{savedPlaces.items.some(item => item.place.id === p.id) && ` · ${copy('Kaydedildi', 'Saved')}`}</small></span><small>≈ {distanceKm(center,p).toFixed(1)} km</small></button>)}</div>
      <p className="ta-muted">{result.attribution || '© OpenStreetMap contributors'} · {copy('Mekân bilgileri ve hizmetler değişebilir. Mesafeler kuş uçuşudur.','Place details and services may change. Distances are straight-line estimates.','Të dhënat dhe shërbimet mund të ndryshojnë. Distancat janë në vijë të drejtë.')} {copy('Alınma','Retrieved')}: {formatAppDate(new Date(result.fetchedAt), locale, { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })}{result.limited && ` · ${copy('Sonuç sınırına ulaşıldı; tüm noktalar gösterilmiyor.','Result limit reached; not all places are shown.')}`}</p></>}
    {!selected && undoNotice}
    {!selected && saveError && <p className="ta-warning" role="alert">{saveError}</p>}
    <Sheet open={!!selected && !!result} title={selected ? name(selected) : ''} onClose={() => setSelected(null)}>{selected && result && <div className="ta-panel">
      <button type="button" className="tsp-save-button" aria-pressed={isSelectedSaved} onClick={toggleSaved}><Icon name={isSelectedSaved ? 'check' : 'bookmark'} size={18}/>{isSelectedSaved ? copy('Kaydedildi · Kaldır', 'Saved · Remove') : copy('Bu yeri kaydet', 'Save this place')}</button>
      <p className="ta-muted">{ownerId ? copy(
        'Kaydettiğin yerler ve notların hesabınla eşitlenir. Bir yeri kaldırdığında bu değişiklik eşitleme sonrası diğer cihazlarına da yansır. İnternet yokken değişiklikler bu cihazda bekler.',
        'Your saved places and notes sync with your account. Removing a place also removes it on your other devices after syncing. Offline changes wait on this device.',
        'Vendet dhe shënimet e ruajtura sinkronizohen me llogarinë tënde. Heqja e një vendi zbatohet edhe në pajisjet e tjera pas sinkronizimit. Ndryshimet pa internet presin në këtë pajisje.',
      ) : copy(
        'Kaydettiğin yerin bilgileri ve notların yalnız bu cihazda tutulur; hesabına yüklenmez, giriş/çıkış yaptığında kalır. Kaydettiğim yerler bölümünden silebilirsin.',
        'Saved place details and notes stay on this device only; they are not uploaded to your account and remain when you sign in or out. Delete them from Saved places.',
        'Të dhënat dhe shënimet e vendeve të ruajtura mbeten vetëm në këtë pajisje; nuk ngarkohen në llogari dhe ruhen kur hyn ose del. Mund t’i fshish te Vendet e ruajtura.',
      )}</p>
      {undoNotice}
      {saveError && <p className="ta-warning" role="alert">{saveError}</p>}
      <p className="tsp-save-status" role="status" aria-live="polite">{saveStatus}</p>
      <p>{selected.description || copy('Bu nokta için kısa açıklama bulunmuyor.','No description is available for this place.')}</p>
      {center && <p>≈ {distanceKm(center,selected).toFixed(1)} km</p>}
      <p>{copy('Çalışma saati kaydı','Listed hours')}: {selected.hours || copy('Bilinmiyor','Unknown')}</p>
      <p>{selected.hours === '24/7' ? copy('24 saat açık olarak kayıtlı; geçici kapanış olabilir.','Listed 24/7; temporary closures are possible.') : copy('Şu an açık/kapalı durumu doğrulanmadı.','Current open/closed status is not verified.')}</p>
      <div className="ta-actions"><button type="button" onClick={() => void openExternal(directionsUrl(`${selected.latitude},${selected.longitude}`))}>{copy('Yol tarifi','Directions')}</button>{selected.website && <button type="button" onClick={() => void openExternal(selected.website!)}>{copy('Kayıttaki web sitesi','Listed website')}</button>}<button type="button" onClick={() => void openExternal(selected.sourceUrl)}>{selected.id.startsWith('apple/') ? copy('Apple Maps kaynağı','Apple Maps source','Burimi Apple Maps') : copy('OSM kaynağı','OSM source','Burimi OSM')}</button></div>
    </div>}</Sheet>
  </section>;
}
