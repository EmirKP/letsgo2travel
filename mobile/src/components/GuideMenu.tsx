import { Sheet } from './Sheet';
import { Icon } from './Icon';
import { TravelToolArtwork, type TravelToolArtworkKind } from './TravelToolArtwork';
import { useI18n } from '../lib/i18n';
import './app-guide.css';

export type GuideDestination = 'explore' | 'route' | 'events' | 'trips' | 'companion';
export type GuideMode = 'example' | 'resume';

/** Opening help never changes a draft or starts a network request. */
export function GuideMenu({ open, onClose, onChoose, hasRouteDraft = false }: { open: boolean; onClose: () => void; onChoose: (destination: GuideDestination, mode?: GuideMode) => void; hasRouteDraft?: boolean }) {
  const { copy } = useI18n();
  const lessons: Array<{ view: GuideDestination; art: TravelToolArtworkKind; title: string; text: string }> = [
    { view: 'explore', art: 'globe', title: copy('Bir yer keşfedeyim', 'Discover a place', 'Zbulo një vend'), text: copy('Bir yer bul → favoriye ekle → kaydını tekrar aç.', 'Find a place → save a favourite → open it again.', 'Gjej një vend → ruaje në të preferuarat → hape përsëri.') },
    { view: 'route', art: 'explore', title: copy('Örnekle öğren', 'Learn with an example', 'Mëso me një shembull'), text: copy('Hazır örnekte günleri incele → kaydet → Planlar’dan aç. AI hakkını kullanmaz; taslağını değiştirmez.', 'Review days in a ready example → save → open in Plans. Uses no AI allowance and leaves your draft intact.', 'Shiko ditët në një shembull → ruaj → hape te Planet. Nuk përdor të drejtën e AI dhe nuk ndryshon draftin.') },
    { view: 'events', art: 'events', title: copy('Etkinlik bulayım', 'Find an event', 'Gjej një aktivitet'), text: copy('Etkinlik Radarı ile ülke ve tarihe göre ara.', 'Search Event Radar by country and date.', 'Kërko në Radarin e aktiviteteve sipas shtetit dhe datës.') },
    { view: 'trips', art: 'saved', title: copy('Kaydettiğim planı açayım', 'Open my saved plan', 'Hap planin tim të ruajtur'), text: copy('Planlar’dan rotana dön; kaldığın yerden devam et.', 'Return to your route in Plans and continue.', 'Kthehu te itinerari në Planet dhe vazhdo.') },
    { view: 'companion', art: 'tools', title: copy('Yoldayken yardım alayım', 'Get help on my trip', 'Merr ndihmë gjatë udhëtimit'), text: copy('Çeviri, döviz ve yakındaki yerleri bul.', 'Find translation, currency and nearby places.', 'Gjej përkthime, këmbim valutor dhe vende pranë.') },
  ];
  return <Sheet open={open} title={copy('Uygulamayı tanı', 'Get to know the app', 'Njihu me aplikacionin')} onClose={onClose}>
    <div className="guide-menu">
      <p>{copy('Ne yapmak istersin? Küçük bir işi adım adım birlikte tamamlayalım. Her adımı geçebilir veya eğitimi kapatabilirsin.', 'What would you like to do? Complete a small task step by step. You can skip a step or close the lesson at any time.', 'Çfarë dëshiron të bësh? Përfundo një detyrë të vogël hap pas hapi. Mund të kalosh një hap ose ta mbyllësh mësimin kur të duash.')}</p>
      <div className="guide-menu-lessons">{lessons.map(lesson => <button type="button" key={lesson.view} onClick={() => onChoose(lesson.view, lesson.view === 'route' ? 'example' : undefined)}>
        <TravelToolArtwork kind={lesson.art} size={52}/><span><strong>{lesson.title}</strong><small>{lesson.text}</small></span><Icon name="chevron" size={18}/>
      </button>)}</div>
      <button type="button" className="secondary-wide guide-menu-resume" onClick={() => onChoose('route', 'resume')}><Icon name="route" size={18}/>{hasRouteDraft ? copy('Taslağıma devam et', 'Continue my draft', 'Vazhdo draftin tim') : copy('Kendi rotamı planla', 'Plan my own route', 'Planifiko itinerarin tim')}</button>
      <p className="guide-menu-note">{copy('Bu eğitime Profil’deki Tercihler ve gizlilik → Uygulama ve yardım bölümünden veya ana sayfa aramasından tekrar ulaşabilirsin. Dil, tema, pasaport ve rota seçimlerin korunur.', 'Find these lessons again in Profile → Preferences & privacy → App & help, or through the home search. Your language, appearance, passport and route choices are kept.', 'Gjej mësimet përsëri te Profili → Preferencat dhe privatësia → Aplikacioni dhe ndihma, ose nga kërkimi në kryefaqe. Gjuha, pamja, pasaporta dhe zgjedhjet e itinerarit ruhen.')}</p>
    </div>
  </Sheet>;
}
