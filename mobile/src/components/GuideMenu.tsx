import { Sheet } from './Sheet';
import { Icon } from './Icon';
import { TravelToolArtwork, type TravelToolArtworkKind } from './TravelToolArtwork';
import { useI18n } from '../lib/i18n';
import './app-guide.css';

export type GuideDestination = 'route' | 'events' | 'trips' | 'companion';

/** Opening help never changes a draft or starts a network request. */
export function GuideMenu({ open, onClose, onChoose }: { open: boolean; onClose: () => void; onChoose: (destination: GuideDestination) => void }) {
  const { copy } = useI18n();
  const lessons: Array<{ view: GuideDestination; art: TravelToolArtworkKind; title: string; text: string }> = [
    { view: 'route', art: 'explore', title: copy('İlk rotamı oluşturayım', 'Create my first route', 'Krijo itinerarin tim të parë'), text: copy('Yer seç → günlerini planla → kaydet.', 'Choose a place → plan your days → save.', 'Zgjidh vendin → planifiko ditët → ruaj.') },
    { view: 'events', art: 'events', title: copy('Etkinlik bulayım', 'Find an event', 'Gjej një aktivitet'), text: copy('Etkinlik Radarı ile ülke ve tarihe göre ara.', 'Search Event Radar by country and date.', 'Kërko në Radarin e aktiviteteve sipas shtetit dhe datës.') },
    { view: 'trips', art: 'saved', title: copy('Kaydettiğim planı açayım', 'Open my saved plan', 'Hap planin tim të ruajtur'), text: copy('Planlar’dan rotana dön; kaldığın yerden devam et.', 'Return to your route in Plans and continue.', 'Kthehu te itinerari në Planet dhe vazhdo.') },
    { view: 'companion', art: 'tools', title: copy('Yoldayken yardım alayım', 'Get help on my trip', 'Merr ndihmë gjatë udhëtimit'), text: copy('Çeviri, döviz ve yakındaki yerleri bul.', 'Find translation, currency and nearby places.', 'Gjej përkthime, këmbim valutor dhe vende pranë.') },
  ];
  return <Sheet open={open} title={copy('Uygulamayı tanı', 'Get to know the app', 'Njihu me aplikacionin')} onClose={onClose}>
    <div className="guide-menu">
      <p>{copy('Ne yapmak istersin? Seçtiğin ekranda kısa ipuçlarıyla yanında olacağız.', 'What would you like to do? Short tips will guide you on the screen you choose.', 'Çfarë dëshiron të bësh? Këshilla të shkurtra do të të ndihmojnë në ekranin që zgjedh.')}</p>
      <div className="guide-menu-lessons">{lessons.map(lesson => <button type="button" key={lesson.view} onClick={() => onChoose(lesson.view)}>
        <TravelToolArtwork kind={lesson.art} size={52}/><span><strong>{lesson.title}</strong><small>{lesson.text}</small></span><Icon name="chevron" size={18}/>
      </button>)}</div>
      <p className="guide-menu-note">{copy('İpuçlarını istediğin zaman kapatabilirsin. Rehber Profil → Uygulama bölümünde her zaman burada.', 'Close the tips whenever you like. Find this guide again in Profile → App.', 'Mbylli këshillat kur të duash. Udhëzuesin e gjen sërish te Profili → Aplikacioni.')}</p>
    </div>
  </Sheet>;
}
