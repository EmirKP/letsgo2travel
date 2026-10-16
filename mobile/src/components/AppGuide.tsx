import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../lib/i18n';
import { GUIDE_IDS, readGuideProgress, saveGuideProgress, type GuideId } from '../lib/appGuide';
import { Icon } from './Icon';
import './app-guide.css';

type Anchor = { id: GuideId; target: HTMLElement; host: HTMLElement; top: number; left: number; width: number; previous?: GuideId };
const targets: Array<{ id: GuideId; selector: string }> = [
  { id: 'search', selector: '[data-guide="home-search"]' },
  { id: 'start', selector: '[data-guide="home-route"]' },
  { id: 'events', selector: '[data-guide="home-events"]' },
  { id: 'destination', selector: '[data-guide="journey-destination"]' },
  { id: 'days', selector: '[data-guide="journey-days"]' },
  { id: 'edit', selector: '[data-guide="journey-edit"]' },
  { id: 'discover', selector: '[data-guide="journey-discover"]' },
  { id: 'save', selector: '[data-guide="journey-save"]' },
  { id: 'plans', selector: '[data-guide="nav-plans"]' },
  { id: 'community', selector: '[data-guide="nav-community"]' },
  { id: 'tools', selector: '[data-guide="nav-tools"]' },
  { id: 'profile', selector: '[data-guide="nav-profile"]' },
];

/** Non-modal help follows genuine controls; it never creates or saves a plan for the user. */
export function AppGuide({ active, revision, paused, view, onStop }: { active: boolean; revision: number; paused: boolean; view: string; onStop: () => void }) {
  const { copy } = useI18n();
  const [seen, setSeen] = useState(() => readGuideProgress().seen);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [review, setReview] = useState<GuideId | null>(null);
  const [cardHeight, setCardHeight] = useState(310);
  const [card, setCard] = useState<HTMLElement | null>(null);
  useEffect(() => { setSeen(readGuideProgress().seen); setReview(null); }, [revision]);
  useEffect(() => {
    if (!card) return;
    const measure = () => setCardHeight(Math.ceil(card.getBoundingClientRect().height));
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(card);
    return () => observer?.disconnect();
  }, [card, anchor?.id, anchor?.width]);

  useEffect(() => {
    if (!active || paused) return;
    let frame = 0;
    const inspect = () => {
      frame = 0;
      let next: Anchor | null = null;
      const visible: Array<{ id: GuideId; target: HTMLElement }> = [];
      for (const item of targets) {
        // Keep navigation help out of a route's lazy-loading interval. The
        // destination/edit/save lesson appears only when its real control exists.
        if (view === 'route' && ['plans', 'tools', 'community', 'profile'].includes(item.id)) continue;
        const target = Array.from(document.querySelectorAll<HTMLElement>(item.selector)).find(element => {
          if (element.closest('[inert], [aria-hidden="true"]') || !element.getClientRects().length) return false;
          const rect = element.getBoundingClientRect();
          return rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
        });
        if (target) visible.push({ id: item.id, target });
      }
      const item = visible.find(item => item.id === review) || visible.find(item => !seen.includes(item.id));
      if (item) {
        const { target } = item;
        const host = target.closest<HTMLElement>('.sheet[role="dialog"]') || document.body;
        const rect = target.getBoundingClientRect();
        const bounds = host === document.body ? { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight } : host.getBoundingClientRect();
        const width = Math.min(332, bounds.width - 24);
        const left = Math.max(12, Math.min(bounds.width - width - 12, rect.left - bounds.left));
        const below = rect.bottom - bounds.top + 12;
        const top = Math.max(12, Math.min(bounds.height - cardHeight - 12, below + cardHeight < bounds.height ? below : rect.top - bounds.top - cardHeight - 12));
        const previous = [...seen].reverse().find(id => id !== item.id && visible.some(candidate => candidate.id === id));
        next = { id: item.id, target, host, top, left, width, previous };
      }
      setAnchor(previous => previous?.id === next?.id && previous?.target === next?.target && previous?.top === next?.top && previous?.left === next?.left && previous?.width === next?.width && previous?.previous === next?.previous ? previous : next);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(inspect); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['inert', 'aria-hidden', 'data-guide'] });
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    inspect();
    return () => { observer.disconnect(); document.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); if (frame) window.cancelAnimationFrame(frame); };
  }, [active, paused, seen, revision, view, review, cardHeight]);

  const acknowledge = useCallback((id: GuideId) => {
    const next = seen.includes(id) ? seen : [...seen, id];
    setReview(null);
    setSeen(next);
    saveGuideProgress({ active: true, seen: next });
  }, [seen]);

  useEffect(() => {
    if (!anchor || !active || paused) return;
    const { target, id } = anchor;
    target.classList.add('app-guide-target');
    const previousDescription = target.getAttribute('aria-describedby');
    target.setAttribute('aria-describedby', [previousDescription, 'app-guide-description'].filter(Boolean).join(' '));
    const action = () => acknowledge(id);
    const event = id === 'destination' || id === 'search' ? 'input' : 'click';
    target.addEventListener(event, action, { once: true });
    return () => {
      target.classList.remove('app-guide-target'); target.removeEventListener(event, action);
      if (previousDescription) target.setAttribute('aria-describedby', previousDescription); else target.removeAttribute('aria-describedby');
    };
  }, [anchor, active, paused, acknowledge]);

  if (!active || paused || !anchor) return null;
  const content: Record<GuideId, { title: string; text: string; steps?: string[] }> = {
    search: { title: copy('Ne arıyorsun?', 'What are you looking for?', 'Çfarë po kërkon?'), text: copy('Şehirleri ve uygulamadaki özellikleri buradan bulabilirsin.', 'Find destinations and app features from this search box.', 'Gjej destinacione dhe veçori nga kjo fushë kërkimi.'), steps: [copy('“İst” yaz; İstanbul önerisine dokun.', 'Type “Ist”, then tap the Istanbul suggestion.', 'Shkruaj “Ist” dhe prek sugjerimin Stamboll.'), copy('“Etkinlik” veya “döviz” yaz; çıkan aracı doğrudan aç.', 'Type “events” or “currency” to open that tool directly.', 'Shkruaj “aktivitete” ose “monedha” për ta hapur mjetin.') ] },
    start: { title: copy('İlk rotanı oluştur', 'Create your first route', 'Krijo itinerarin tënd të parë'), text: copy('Rota’ya dokun; kısa sorularla sana uygun günlük program hazırlayalım.', 'Tap Route to build a daily itinerary with a few short questions.', 'Prek Itinerar për të krijuar një program ditor me disa pyetje.'), steps: [copy('Gideceğin yeri, gün sayısını ve gezi tercihlerini seç.', 'Choose your destination, number of days and travel preferences.', 'Zgjidh destinacionin, numrin e ditëve dhe preferencat.'), copy('Rotan hazır olduğunda durakları haritada düzenleyip kaydet.', 'When your route is ready, adjust its stops on the map and save it.', 'Kur itinerari të jetë gati, ndrysho ndalesat në hartë dhe ruaje.')] },
    events: { title: copy('Etkinlik Radarı’nı keşfet', 'Discover Event Radar', 'Zbulo Radarin e aktiviteteve'), text: copy('Seyahat tarihindeki konserleri, festivalleri ve diğer etkinlikleri burada ara.', 'Find concerts, festivals and other events during your trip.', 'Gjej koncerte, festivale dhe aktivitete gjatë udhëtimit.'), steps: [copy('Ülkeyi, istersen şehri ve tarih aralığını seç; “Etkinlikleri bul”a dokun.', 'Choose a country, optional city and dates, then tap Find events.', 'Zgjidh shtetin, qytetin sipas dëshirës dhe datat; prek Gjej aktivitete.'), copy('Bir etkinliği kaydet veya tarihleri uygun seyahatine ekle.', 'Save an event or add it to a trip with matching dates.', 'Ruaj një aktivitet ose shtoje në një udhëtim me data përkatëse.')] },
    destination: { title: copy('Gideceğin yeri seç', 'Choose where to go', 'Zgjidh ku do të shkosh'), text: copy('Bir şehir, ilçe veya mahalle yaz. Açılan öneriye dokun; sonra gününü ve tercihlerini seç.', 'Type a city, district or neighbourhood. Tap a suggestion, then choose your days and preferences.', 'Shkruaj qytet, zonë ose lagje. Prek një sugjerim, pastaj zgjidh ditët dhe preferencat.') },
    days: { title: copy('Programını gün gün incele', 'Review each day', 'Shiko çdo ditë'), text: copy('Bir güne dokununca yalnız o günün durakları ve rotası görünür.', 'Tap a day to see its stops and route.', 'Prek një ditë për të parë ndalesat dhe itinerarin e saj.'), steps: [copy('Diğer günleri görmek için gün şeridini yana kaydır.', 'Swipe the day strip sideways to reach later days.', 'Rrëshqit shiritin anash për të parë ditët e tjera.'), copy('“Genel” tüm günleri gösterir. Alt paneli tutamacından büyütüp programı oku.', 'Overview shows all days. Expand the bottom panel with its handle to read the itinerary.', 'Përmbledhja tregon të gjitha ditët. Zmadho panelin nga doreza për të lexuar programin.')] },
    edit: { title: copy('Rotanı kendine göre düzenle', 'Make the route yours', 'Përshtate itinerarin'), text: copy('Bir durağa dokunarak süresini ve notunu değiştir. Haritadan yeni yerler de ekleyebilirsin.', 'Tap a stop to change its duration and note. You can add more places from the map.', 'Prek një ndalesë për të ndryshuar kohëzgjatjen dhe shënimin. Mund të shtosh vende nga harta.') },
    discover: { title: copy('Rotana yeni bir yer ekle', 'Add a place to your route', 'Shto një vend në itinerar'), text: copy('“Mekânları keşfet” bölümünde haritadaki yerleri incele.', 'Use Discover places to explore places on the map.', 'Përdor Zbulo vende për të parë vendet në hartë.'), steps: [copy('Haritayı istediğin bölgeye taşı, ardından “Bu bölgede ara”ya dokun.', 'Move the map to your area, then tap Search this area.', 'Lëviz hartën te zona e dëshiruar dhe prek Kërko në këtë zonë.'), copy('Bir yeri aç, eklemek istediğin günü seç ve programına ekle.', 'Open a place, choose the day and add it to your itinerary.', 'Hap një vend, zgjidh ditën dhe shtoje në program.')] },
    save: { title: copy('Rotanı kaydet', 'Save your route', 'Ruaj itinerarin'), text: copy('Bu düğme planını saklar. Kaydettiğinde Planlar bölümünden tekrar açabilirsin.', 'This button keeps your plan. Once saved, reopen it from Plans.', 'Ky buton ruan planin. Pasi ta ruash, hape përsëri te Planet.') },
    plans: { title: copy('Planların burada', 'Your plans live here', 'Planet e tua janë këtu'), text: copy('Kaydettiğin rotaları Planlar’dan aç. Yeni rota oluşturmak için de buradan başlayabilirsin.', 'Open your saved routes in Plans. You can also start a new route here.', 'Hap itineraret e ruajtura te Planet. Këtu mund të fillosh edhe një itinerar të ri.') },
    community: { title: copy('Gezginlerden yardım al', 'Ask other travellers', 'Pyet udhëtarët e tjerë'), text: copy('Topluluk’ta ülke seçip soruları incele; bir konuya dokunarak cevapları oku.', 'Choose a country in Community and browse questions. Tap a topic to read its replies.', 'Zgjidh një shtet te Komuniteti dhe shfleto pyetjet. Prek një temë për përgjigjet.'), steps: [copy('Soru sormak veya cevap yazmak için giriş yap.', 'Sign in to ask a question or write a reply.', 'Hyr për të bërë pyetje ose për të shkruar përgjigje.')] },
    tools: { title: copy('Yoldayken Araçlar’a bak', 'Find help in Tools', 'Gjej ndihmë te Mjetet'), text: copy('Harita, çeviri ve para çevirici burada. İhtiyacın olan aracın adına dokun.', 'Maps, translation and the currency converter are here. Tap the tool you need.', 'Hartat, përkthimi dhe këmbimi valutor janë këtu. Prek mjetin që të duhet.') },
    profile: { title: copy('Ayarların ve yardımın burada', 'Your settings and help', 'Cilësimet dhe ndihma jote'), text: copy('Profil’den hesabını, dilini ve temanı yönetebilirsin.', 'Manage your account, language and appearance from Profile.', 'Menaxho llogarinë, gjuhën dhe pamjen nga Profili.'), steps: [copy('Bu rehberi yeniden açmak için Uygulama → Uygulamayı tanı yolunu izle.', 'Reopen this guide from App → Get to know the app.', 'Rihap këtë udhëzues te Aplikacioni → Njihu me aplikacionin.')] },
  };
  const tip = content[anchor.id];
  return createPortal(<aside ref={setCard} className="app-guide-card" role="region" aria-label={copy('Uygulamayı tanı', 'Get to know the app', 'Njihu me aplikacionin')} style={{ position: anchor.host === document.body ? 'fixed' : 'absolute', top: anchor.top, left: anchor.left, width: anchor.width }}>
    <div className="app-guide-meta"><span>{copy(`${seen.length}/${GUIDE_IDS.length} ipucu keşfedildi`, `${seen.length}/${GUIDE_IDS.length} tips explored`, `${seen.length}/${GUIDE_IDS.length} këshilla të eksploruara`)}</span><button type="button" onClick={onStop} aria-label={copy('Turu kapat', 'Close tour', 'Mbyll udhëzuesin')}><Icon name="close" size={17}/></button></div>
    <div className="app-guide-heading"><Icon name="sparkles" size={19}/><strong>{tip.title}</strong></div>
    <p id="app-guide-description">{tip.text}</p>
    {tip.steps && <ol>{tip.steps.map(step => <li key={step}>{step}</li>)}</ol>}
    <div className="app-guide-actions"><button type="button" disabled={!anchor.previous} onClick={() => anchor.previous && setReview(anchor.previous)}>{copy('Geri', 'Back', 'Prapa')}</button><button type="button" onClick={() => acknowledge(anchor.id)}>{copy('Atla', 'Skip', 'Kalo')}</button><button type="button" className="app-guide-next" onClick={() => { acknowledge(anchor.id); anchor.target.focus({ preventScroll: true }); }}>{copy('Anladım', 'Got it', 'E kuptova')}<Icon name="check" size={16}/></button></div>
    <button className="app-guide-restart" type="button" onClick={() => { setReview(null); setSeen([]); saveGuideProgress({ active: true, seen: [] }); }}>{copy('Rehberi baştan başlat', 'Restart guide', 'Rifillo udhëzuesin')}</button>
  </aside>, anchor.host);
}
