import { useEffect, useId, useState } from 'react';
import { CATEGORY_LABELS, NEEDS, TOURING } from '../../../lib/travel-assistant/places';
import { useI18n } from '../lib/i18n';
import { openExternal } from '../lib/native';
import { directionsUrl } from '../lib/travelAssistant';
import {
  MAX_DAY_STOPS, MAX_PLACE_NOTE, MAX_SAVED_PLACES, deleteTravelPlace, moveTravelDayStop,
  readSavedPlaces, resetSavedPlaces, setTravelDayStop, subscribeSavedPlaces, updateTravelPlaceNote,
} from '../lib/savedPlaces';
import type { SavedPlace, SavedPlacesState } from '../lib/savedPlaces';
import { Icon } from './Icon';
import './saved-places.css';

export function TravelSavedPlaces({ onExplore }: { onExplore?: () => void }) {
  const { copy, locale } = useI18n();
  const [state, setState] = useState(readSavedPlaces);
  const [view, setView] = useState<'saved' | 'day'>('saved');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => subscribeSavedPlaces(() => setState(readSavedPlaces())), []);
  const label = (item: SavedPlace) => item.place.name || CATEGORY_LABELS[item.place.category][locale === 'tr' ? 0 : 1];
  const fold = (value: string) => value.toLocaleLowerCase(locale).normalize('NFD').replace(/\p{M}/gu, '');
  const term = fold(query.trim());
  const dayItems = state.dayIds.flatMap(id => {
    const item = state.items.find(item => item.place.id === id);
    return item ? [item] : [];
  });
  const visible = view === 'day' ? dayItems : state.items.filter(item =>
    (!category || item.place.category === category)
    && (!term || fold(`${label(item)} ${item.note} ${CATEGORY_LABELS[item.place.category].join(' ')}`).includes(term)));

  function change(action: () => SavedPlacesState, message: string): boolean {
    try {
      setState(action());
      setError('');
      setStatus(message);
      return true;
    } catch (e) {
      setStatus('');
      const code = e instanceof Error ? e.message : '';
      setError(code === 'day-full'
        ? copy(`Gezi sırana en fazla ${MAX_DAY_STOPS} durak ekleyebilirsin. Önce bir durağı çıkar.`, `Your day list holds up to ${MAX_DAY_STOPS} stops. Remove one first.`)
        : code === 'missing'
          ? copy('Bu yer artık listede bulunmuyor. Listeyi yeniden aç.', 'This place is no longer in the list. Reopen the list.')
          : copy('Değişiklik kaydedilemedi. Cihaz depolamasını kontrol et; önceki listen korunuyor.', 'Could not save the change. Check device storage; your previous list is preserved.'));
      setState(readSavedPlaces());
      return false;
    }
  }
  async function visit(url: string) {
    if (!await openExternal(url)) setError(copy('Bağlantı açılamadı. İnternetini kontrol edip tekrar dene.', 'Could not open the link. Check your connection and try again.'));
  }
  return <section className="ta-panel tsp-panel">
    <header className="tsp-heading">
      <span className="tsp-heading-icon" aria-hidden="true"><Icon name="bookmark" size={26}/></span>
      <div><h3>{copy('Kaydet, sırala, keşfet', 'Save, arrange, explore')}</h3><p>{copy('Beğendiğin yerler ve sana özel gezi sıran, internet olmasa da yanında.', 'Your favourite places and personal day list stay with you, even offline.')}</p></div>
    </header>
    <p className="ta-muted">{copy(
      `Yalnız Kaydet dediğin yerler ve notların bu cihazda saklanır; arama ve konum geçmişi kaydedilmez. Hesabına yüklenmez ve giriş/çıkış yaptığında kalır. Aynı cihazı kullanan kişiler görebilir. Uygulama verilerini temizlemek kayıtları siler. En fazla ${MAX_SAVED_PLACES} yer.`,
      `Only places you tap Save on and your notes are stored on this device; search and location history are not saved. They are not uploaded to your account and remain when you sign in or out. Other people using this device can see them. Clearing app data deletes them. Up to ${MAX_SAVED_PLACES} places.`,
    )}</p>
    <div className="tsp-views" role="group" aria-label={copy('Liste görünümü', 'List view')}>
      <button type="button" aria-pressed={view === 'saved'} onClick={() => setView('saved')}><Icon name="bookmark" size={17}/>{copy('Kaydettiğim yerler', 'Saved places')}<span>{state.items.length}</span></button>
      <button type="button" aria-pressed={view === 'day'} onClick={() => setView('day')}><Icon name="route" size={17}/>{copy('Gezi sıram', 'Day list')}<span>{state.dayIds.length}</span></button>
    </div>
    {state.error && <div className="ta-warning" role="alert">
      <p>{state.error === 'corrupt'
        ? copy('Kayıtlı yer listesi okunamıyor. Verilerin kendiliğinden silinmedi. Listeyi sıfırlamak bu cihazdaki kayıtlı yerleri, gezi sırasını ve notlarını siler.', 'The saved list could not be read. Your data has not been deleted automatically. Resetting removes the saved places, day list and notes on this device.')
        : copy('Cihaz depolamasına erişilemiyor. Kayıtlarını görüntülemek için uygulamayı yeniden açmayı deneyebilirsin.', 'Device storage is unavailable. Try reopening the app to view your saved places.')}</p>
      {state.error === 'corrupt' && <div className="ta-actions">
        <button type="button" onClick={() => {
          if (!confirmReset) { setConfirmReset(true); return; }
          if (change(resetSavedPlaces, copy('Kayıtlı yer listesi sıfırlandı.', 'Saved list reset.'))) setConfirmReset(false);
        }}>{confirmReset ? copy('Yerleri ve notları silerek sıfırla', 'Delete places and notes to reset') : copy('Listeyi sıfırla', 'Reset list')}</button>
        {confirmReset && <button type="button" onClick={() => setConfirmReset(false)}>{copy('Vazgeç', 'Cancel')}</button>}
      </div>}
    </div>}
    {view === 'saved' && state.items.length > 0 && <div className="tsp-filters">
      <label>{copy('Yer veya not ara', 'Search places or notes')}<input type="search" maxLength={100} value={query} onChange={event => setQuery(event.target.value)} placeholder={copy('Müze, kahve molası…', 'Museum, coffee break…')}/></label>
      <label>{copy('Kategori', 'Category')}<select value={category} onChange={event => setCategory(event.target.value)}><option value="">{copy('Tüm kategoriler', 'All categories')}</option>{[...NEEDS, ...TOURING].map(key => <option key={key} value={key}>{CATEGORY_LABELS[key][locale === 'tr' ? 0 : 1]}</option>)}</select></label>
    </div>}
    {view === 'day' && <p className="ta-muted">{copy(
      `Kaydettiğin yerlerden ${MAX_DAY_STOPS} durağa kadar seç, oklarla ziyaret sırasını ayarla. Bu kişisel bir sıralamadır; yol süresi hesaplamaz veya rotayı eniyilemez. Sıralaman sen değiştirene kadar kalır.`,
      `Choose up to ${MAX_DAY_STOPS} saved places and arrange them with the arrows. This is your personal sequence; it does not calculate travel time or optimise a route. Your list stays until you change it.`,
    )}</p>}
    {error && <p className="ta-warning" role="alert">{error}</p>}
    <p className="tsp-status" role="status" aria-live="polite">{status}</p>
    {!state.error && visible.length === 0 && <div className="tsp-empty">
      <Icon name={view === 'day' ? 'route' : 'bookmark'} size={32}/>
      <h4>{view === 'day' ? copy('İlk durağını seç', 'Choose your first stop') : state.items.length ? copy('Eşleşen yer bulunamadı', 'No matching places') : copy('Yeni yerler seni bekliyor', 'New places are waiting')}</h4>
      <p>{view === 'day'
        ? copy('Kaydettiğim yerler sekmesinde bir yerin “Gezi sırama ekle” düğmesine dokun.', 'Tap “Add to day list” on a place in Saved places.')
        : state.items.length
          ? copy('Aramayı veya kategori filtresini değiştir.', 'Try another search or category.')
          : copy('Gezi ya da İhtiyaç haritasında bir noktayı açıp Kaydet’e dokun. Sonra burada not ekleyip gezi sıranı oluşturabilirsin.', 'Open a place on the Sightseeing or Essentials map and tap Save. Then add notes and arrange your day here.')}</p>
      {view === 'day' ? <button type="button" className="secondary-wide" onClick={() => setView('saved')}>{copy('Kaydettiğim yerlere git', 'Go to saved places')}</button>
        : state.items.length ? <button type="button" className="secondary-wide" onClick={() => { setCategory(''); setQuery(''); }}>{copy('Filtreleri temizle', 'Clear filters')}</button>
          : onExplore && <button type="button" className="primary-wide" onClick={onExplore}>{copy('Gezi haritasını aç', 'Open sightseeing map')}</button>}
    </div>}
    <ol className="tsp-list" aria-label={view === 'day' ? copy('Gezi sırası', 'Day sequence') : copy('Kaydettiğim yerler', 'Saved places')}>
      {visible.map((item, index) => <SavedPlaceCard key={item.place.id} item={item} name={label(item)}
        dayIndex={view === 'day' ? index : null} dayTotal={state.dayIds.length} inDay={state.dayIds.includes(item.place.id)}
        onVisit={url => void visit(url)}
        onNote={note => change(() => updateTravelPlaceNote(item.place.id, note), copy('Not kaydedildi.', 'Note saved.'))}
        onDelete={() => change(() => deleteTravelPlace(item.place.id), copy(`${label(item)} kayıtlı yerlerden kaldırıldı.`, `${label(item)} removed from saved places.`))}
        onDay={() => change(() => setTravelDayStop(item.place.id, !state.dayIds.includes(item.place.id)), state.dayIds.includes(item.place.id) ? copy('Gezi sırasından çıkarıldı.', 'Removed from day list.') : copy('Gezi sırasına eklendi.', 'Added to day list.'))}
        onMove={direction => change(() => moveTravelDayStop(item.place.id, direction), copy(`${label(item)} ${index + direction + 1}. sıraya taşındı.`, `${label(item)} moved to position ${index + direction + 1}.`))}
      />)}
    </ol>
    {state.items.length > 0 && <p className="ta-muted">{copy('Kayıtlı bilgiler son alındığı hâliyle gösterilir; çalışma saatleri ve erişim değişebilir. Gitmeden önce kaynağı kontrol et. Yol tarifi ve dış bağlantılar internet veya başka bir harita uygulaması gerektirebilir.', 'Saved information is a snapshot; hours and access may change. Check the source before visiting. Directions and external links may need internet or another maps app.')}</p>}
  </section>;
}

function SavedPlaceCard({ item, name, dayIndex, dayTotal, inDay, onVisit, onNote, onDelete, onDay, onMove }: {
  item: SavedPlace; name: string; dayIndex: number | null; dayTotal: number; inDay: boolean;
  onVisit: (url: string) => void; onNote: (note: string) => boolean; onDelete: () => void;
  onDay: () => void; onMove: (direction: -1 | 1) => void;
}) {
  const { copy, locale } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const noteId = useId();
  const p = item.place;
  return <li className="tsp-card">
    <div className="tsp-card-heading">
      {dayIndex !== null && <span className="tsp-stop-number" aria-label={copy(`${dayIndex + 1}. durak`, `Stop ${dayIndex + 1}`)}>{dayIndex + 1}</span>}
      <div><h4>{name}</h4><p>{CATEGORY_LABELS[p.category][locale === 'tr' ? 0 : 1]}{dayIndex === null && inDay && <span className="tsp-day-tag">{copy('Gezi sırasında', 'In day list')}</span>}</p></div>
    </div>
    {item.note && !editing && <p className="tsp-note">{item.note}</p>}
    {editing ? <form className="tsp-note-editor" onSubmit={event => { event.preventDefault(); if (onNote(draft)) setEditing(false); }}>
      <label htmlFor={noteId}>{copy('Bu yer için notum', 'My note for this place')}</label>
      <textarea id={noteId} rows={3} value={draft} maxLength={MAX_PLACE_NOTE} onChange={event => setDraft(event.target.value)} autoFocus/>
      <small>{draft.length}/{MAX_PLACE_NOTE}</small>
      <div className="ta-actions"><button type="submit">{copy('Notu kaydet', 'Save note')}</button><button type="button" onClick={() => setEditing(false)}>{copy('Vazgeç', 'Cancel')}</button></div>
    </form> : <button type="button" className="tsp-text-button" onClick={() => { setDraft(item.note); setEditing(true); }}>{item.note ? copy('Notu düzenle', 'Edit note') : copy('Not ekle', 'Add note')}</button>}
    <div className="ta-actions tsp-main-actions">
      <button type="button" onClick={() => onVisit(directionsUrl(`${p.latitude},${p.longitude}`))}><Icon name="route" size={16}/>{copy('Yol tarifi', 'Directions')}</button>
      <button type="button" onClick={onDay} aria-pressed={inDay}>{inDay ? copy('Gezi sırasından çıkar', 'Remove from day list') : copy('Gezi sırama ekle', 'Add to day list')}</button>
    </div>
    {dayIndex !== null && <div className="tsp-order" role="group" aria-label={copy(`${name} ziyaret sırası`, `${name} visit order`)}>
      <button type="button" disabled={dayIndex === 0} onClick={() => onMove(-1)} aria-label={copy(`${name} bir sıra yukarı`, `Move ${name} up one position`)}><span aria-hidden="true">↑</span>{copy('Yukarı', 'Up')}</button>
      <button type="button" disabled={dayIndex === dayTotal - 1} onClick={() => onMove(1)} aria-label={copy(`${name} bir sıra aşağı`, `Move ${name} down one position`)}><span aria-hidden="true">↓</span>{copy('Aşağı', 'Down')}</button>
    </div>}
    <details className="tsp-details"><summary>{copy('Kaynak ve kayıt bilgileri', 'Source and saved information')}</summary>
      {p.description && <p>{p.description}</p>}
      <p>{copy('Kayıttaki çalışma saatleri', 'Hours in saved record')}: {p.hours || copy('Bilinmiyor', 'Unknown')}</p>
      <p>{copy('Veri alındı', 'Data retrieved')}: <time dateTime={p.fetchedAt}>{new Date(p.fetchedAt).toLocaleString(locale)}</time></p>
      <p>{copy('Kaydettin', 'Saved')}: <time dateTime={item.savedAt}>{new Date(item.savedAt).toLocaleString(locale)}</time></p>
      <p>{p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}</p>
      <div className="ta-actions"><button type="button" onClick={() => onVisit(p.sourceUrl)}>{copy('OpenStreetMap kaynağı', 'OpenStreetMap source')}</button>{p.website && <button type="button" onClick={() => onVisit(p.website!)}>{copy('Kayıttaki web sitesi', 'Listed website')}</button>}</div>
      <p className="ta-muted">© OpenStreetMap contributors · ODbL</p>
    </details>
    <button type="button" className="tsp-delete" onClick={onDelete} aria-label={copy(`${name} kayıtlı yerlerden kaldır`, `Remove ${name} from saved places`)}><Icon name="trash" size={16}/>{copy('Kaydı kaldır', 'Remove saved place')}</button>
  </li>;
}
