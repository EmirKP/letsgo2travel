import { useEffect, useId, useState } from 'react';
import type { Place } from '../../../lib/travel-assistant/types';
import {
  MAX_PERSONAL_PIN_NAME, MAX_PERSONAL_PIN_NOTE, personalPinPlace, readPersonalMapPins,
  removePersonalMapPin, restorePersonalMapPin, subscribePersonalMapPins, updatePersonalMapPin,
  type PersonalMapPin, type RemovedPersonalMapPin,
} from '../lib/personalMapPins';
import { useI18n } from '../lib/i18n';
import { Icon } from './Icon';
import { TravelSavedPlaces } from './TravelSavedPlaces';
import './travel-map-library.css';

type LibraryProps = {
  ownerId?: string | null;
  onSelectPlace: (place: Place) => void;
  onDirections: (place: Place) => void;
  onExplore: () => void;
};

export function TravelMapLibrary(props: LibraryProps) {
  return <MapLibraryForOwner key={props.ownerId || 'guest'} {...props}/>;
}

function MapLibraryForOwner({ ownerId, onSelectPlace, onDirections, onExplore }: LibraryProps) {
  const { copy } = useI18n();
  const [state, setState] = useState(() => readPersonalMapPins(ownerId));
  const [visible, setVisible] = useState(3);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [removed, setRemoved] = useState<RemovedPersonalMapPin | null>(null);
  useEffect(() => subscribePersonalMapPins(() => setState(readPersonalMapPins(ownerId)), ownerId), [ownerId]);

  function change(action: () => unknown, message: string) {
    try {
      action(); setState(readPersonalMapPins(ownerId)); setError(''); setStatus(message); return true;
    } catch (failure) {
      setStatus('');
      setError(failure instanceof Error && failure.message === 'missing'
        ? copy('Bu işaret artık bulunmuyor. Listeyi yeniden aç.', 'This pin is no longer available. Reopen the list.', 'Kjo shenjë nuk gjendet më. Hape sërish listën.')
        : copy('Değişiklik kaydedilemedi. Önceki kayıtların korunuyor; depolamayı kontrol edip tekrar dene.', 'The change could not be saved. Your previous records are preserved; check storage and retry.', 'Ndryshimi nuk u ruajt. Regjistrimet e mëparshme ruhen; kontrollo hapësirën dhe provo sërish.'));
      setState(readPersonalMapPins(ownerId)); return false;
    }
  }

  return <div className="tml-library">
    <section className="tml-personal" aria-labelledby="personal-map-pins-title">
      <header><h3 id="personal-map-pins-title">{copy('Kendi işaretlerim', 'My personal pins', 'Shenjat e mia')}</h3><span>{state.items.length}</span></header>
      <p className="tml-storage-note">{ownerId
        ? copy('Bu hesaba özel · Yalnız bu cihazda', 'Private to this account · Only on this device', 'Private për këtë llogari · Vetëm në këtë pajisje')
        : copy('Kişisel işaretlerin yalnız bu cihazda saklanır.', 'Your personal pins are stored only on this device.', 'Shenjat e tua personale ruhen vetëm në këtë pajisje.')}</p>
      {state.error && <p role="alert" className="tml-error">{state.error === 'corrupt'
        ? copy('İşaretler okunamadı. Mevcut kayıtların silinmedi veya değiştirilmedi.', 'Pins could not be read. Existing records were not deleted or changed.', 'Shenjat nuk u lexuan. Regjistrimet ekzistuese nuk u fshinë apo ndryshuan.')
        : copy('Cihaz depolamasına erişilemiyor. İşaretlerini görmek için uygulamayı yeniden açmayı dene.', 'Device storage is unavailable. Try reopening the app to view your pins.', 'Nuk ka qasje te ruajtja në pajisje. Provo të rihapësh aplikacionin për të parë shenjat.')}</p>}
      {error && <p role="alert" className="tml-error">{error}</p>}
      <p role="status" aria-live="polite" className="tml-status">{status}</p>
      {removed && <div className="tml-undo"><span>{copy('İşaret kaldırıldı.', 'Pin removed.', 'Shenja u hoq.')}</span><button type="button" onClick={() => { if (change(() => restorePersonalMapPin(removed, ownerId), copy('İşaretin ve notun geri alındı.', 'Your pin and note were restored.', 'Shenja dhe shënimi yt u rikthyen.'))) setRemoved(null); }}>{copy('Geri al', 'Undo', 'Zhbëj')}</button></div>}
      {!state.error && !state.items.length && <p className="tml-empty">{copy('Haritada istediğin noktayı işaretleyip burada saklayabilirsin.', 'Mark a point on the map to keep it here.', 'Shëno një pikë në hartë për ta ruajtur këtu.')}</p>}
      <ul className="tml-pins">{state.items.slice(0, visible).map(item => <PersonalPinRow key={item.id} item={item}
        onSelect={() => onSelectPlace(personalPinPlace(item))} onDirections={() => onDirections(personalPinPlace(item))}
        onSave={(name, note) => change(() => updatePersonalMapPin(item.id, { name, note }, ownerId), copy('İşaret kaydedildi.', 'Pin saved.', 'Shenja u ruajt.'))}
        onDay={() => change(() => updatePersonalMapPin(item.id, { inDay: !item.inDay }, ownerId), item.inDay ? copy('Gezi işareti kaldırıldı.', 'Trip mark removed.', 'Shenja e udhëtimit u hoq.') : copy('Gezi için işaretlendi.', 'Marked for trip.', 'U shënua për udhëtim.'))}
        onRemove={() => { let token: RemovedPersonalMapPin | null = null; if (change(() => { token = removePersonalMapPin(item.id, ownerId); }, copy('İşaret kaldırıldı.', 'Pin removed.', 'Shenja u hoq.'))) setRemoved(token); }}/>)}</ul>
      {visible < state.items.length && <button type="button" className="tml-more" onClick={() => setVisible(value => value + 5)}>{copy('Diğer işaretler', 'More pins', 'Shenja të tjera')} · {state.items.length - visible}</button>}
    </section>
    <div className="tml-provider-library"><TravelSavedPlaces ownerId={ownerId} hideMap onSelectPlace={onSelectPlace} onDirections={onDirections} onExplore={onExplore} onExploreLabel={copy('Haritada yer ara', 'Find places on the map', 'Gjej vende në hartë')}/></div>
  </div>;
}

function PersonalPinRow({ item, onSelect, onDirections, onSave, onDay, onRemove }: {
  item: PersonalMapPin; onSelect: () => void; onDirections: () => void; onSave: (name: string, note: string) => boolean; onDay: () => void; onRemove: () => void;
}) {
  const { copy } = useI18n(), id = useId();
  const [editing, setEditing] = useState(false), [name, setName] = useState(item.name), [note, setNote] = useState(item.note);
  return <li className="tml-pin">
    <button type="button" className="tml-pin-select" onClick={onSelect}><Icon name="flag" size={19}/><span><strong>{item.name}</strong><small>{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</small></span><Icon name="chevron" size={16}/></button>
    {item.note && !editing && <p className="tml-pin-note">{item.note}</p>}
    {editing && <form className="tml-pin-editor" onSubmit={event => { event.preventDefault(); if (onSave(name, note)) setEditing(false); }}>
      <label htmlFor={`${id}-name`}>{copy('İşaretin adı', 'Pin name', 'Emri i shenjës')}</label><input id={`${id}-name`} required maxLength={MAX_PERSONAL_PIN_NAME} value={name} onChange={event => setName(event.target.value)}/>
      <label htmlFor={`${id}-note`}>{copy('Notum', 'My note', 'Shënimi im')}</label><textarea id={`${id}-note`} maxLength={MAX_PERSONAL_PIN_NOTE} rows={2} value={note} onChange={event => setNote(event.target.value)}/>
      <div><button type="submit">{copy('Kaydet', 'Save', 'Ruaj')}</button><button type="button" onClick={() => setEditing(false)}>{copy('Vazgeç', 'Cancel', 'Anulo')}</button></div>
    </form>}
    <div className="tml-pin-actions"><button type="button" onClick={onDirections}><Icon name="route" size={15}/>{copy('Yol tarifi', 'Directions', 'Udhëzime')}</button><button type="button" aria-pressed={item.inDay} onClick={onDay}>{item.inDay ? copy('Gezi için işaretli', 'Marked for trip', 'Shënuar për udhëtim') : copy('Gezi için işaretle', 'Mark for trip', 'Shëno për udhëtim')}</button><button type="button" onClick={() => { setName(item.name); setNote(item.note); setEditing(true); }}>{copy('Düzenle', 'Edit', 'Ndrysho')}</button><button type="button" onClick={onRemove} aria-label={copy(`${item.name} işaretini kaldır`, `Remove pin ${item.name}`, `Hiq shenjën ${item.name}`)}><Icon name="trash" size={16}/></button></div>
  </li>;
}
