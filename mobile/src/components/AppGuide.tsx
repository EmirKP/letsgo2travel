import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../lib/i18n';
import { GUIDE_IDS, guideSteps, guideTaskForIntent, readGuideProgress, saveGuideProgress, type GuideId, type GuideTask } from '../lib/appGuide';
import type { WelcomeIntent } from '../lib/onboardingPreferences';
import { Icon } from './Icon';
import './app-guide.css';

type Anchor = { id: GuideId; target: HTMLElement; host: HTMLElement; top: number; bottomOffset: number; left: number; width: number; maxHeight: number; offscreen: boolean; emptySaved: boolean; eventRecovery?: 'empty' | 'saved'; recovery?: 'empty' | 'route-only' | 'missing'; previous?: GuideId };
const targets: Array<{ id: GuideId; selector: string }> = [
  { id: 'search', selector: '[data-guide="home-search"]' },
  { id: 'start', selector: '[data-guide="home-route"]' },
  { id: 'events', selector: '[data-guide="home-events"]' },
  { id: 'eventSearch', selector: '[data-guide="event-search"]' },
  { id: 'eventSaved', selector: '[data-guide="event-saved"]' },
  { id: 'eventSave', selector: '[data-guide="event-save"]' },
  { id: 'destination', selector: '[data-guide="journey-destination"]' },
  { id: 'days', selector: '[data-guide="journey-days"]' },
  { id: 'edit', selector: '[data-guide="journey-edit"]' },
  { id: 'discover', selector: '[data-guide="journey-discover"]' },
  { id: 'save', selector: '[data-guide="journey-save"]' },
  { id: 'library', selector: '[data-guide="saved-library"]' },
  { id: 'toolSearch', selector: '[data-guide="tool-search"]' },
  { id: 'plans', selector: '[data-guide="nav-plans"]' },
  { id: 'community', selector: '[data-guide="nav-community"]' },
  { id: 'tools', selector: '[data-guide="nav-tools"]' },
  { id: 'profile', selector: '[data-guide="nav-profile"]' },
  { id: 'exploreSearch', selector: '[data-guide="explore-search"]' },
  { id: 'explorePlace', selector: '[data-guide="explore-place"]' },
  { id: 'exploreSave', selector: '[data-guide="explore-save"]' },
  { id: 'exploreBack', selector: '[data-guide="explore-back"]' },
  { id: 'savedCountries', selector: '[data-guide="saved-countries"]' },
  { id: 'savedCountryOpen', selector: '[data-guide="saved-country-open"]' },
  { id: 'savedRouteOpen', selector: '[data-guide="saved-route-open"]' },
  { id: 'travelCountry', selector: '[data-guide="travel-country"]' },
  { id: 'travelTool', selector: '[data-guide="travel-tool"]' },
];

/** Non-modal help follows genuine controls; it never creates or saves a plan for the user. */
export function AppGuide({ active, revision, paused, keyboardOpen = false, view, intent, task, onStop, onComplete, onOpenExample }: { active: boolean; revision: number; paused: boolean; keyboardOpen?: boolean; view: string; intent?: WelcomeIntent; task?: GuideTask; onStop: () => void; onComplete?: () => void; onOpenExample?: () => void }) {
  const { copy } = useI18n();
  const lesson = task || (intent ? guideTaskForIntent(intent) : undefined);
  const steps = lesson ? guideSteps(lesson) : GUIDE_IDS;
  const [seen, setSeen] = useState(() => readGuideProgress().seen);
  const [skipped, setSkipped] = useState(() => readGuideProgress().skipped || []);
  const [progressRevision, setProgressRevision] = useState(revision);
  const progressReady = progressRevision === revision;
  const [completed, setCompleted] = useState(false);
  const [eventAttempt, setEventAttempt] = useState<{ target: HTMLElement; success: string | null } | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [review, setReview] = useState<GuideId | null>(null);
  const [cardHeight, setCardHeight] = useState(310);
  const [card, setCard] = useState<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [minimizedFor, setMinimizedFor] = useState<{ id: GuideId; target: HTMLElement; eventRecovery?: 'empty' | 'saved'; revision: number } | null>(null);
  const minimized = keyboardOpen || Boolean(anchor && minimizedFor?.id === anchor.id && minimizedFor.target === anchor.target && minimizedFor.eventRecovery === anchor.eventRecovery && minimizedFor.revision === revision);
  useEffect(() => { setExpanded(false); }, [anchor?.id, revision]);
  // Restarting changes the stored progress before React applies these state
  // updates. Until this revision is loaded, old completed steps must neither
  // finish the new lesson nor attach its card to an old target.
  useEffect(() => { const progress = readGuideProgress(); setSeen(progress.seen); setSkipped(progress.skipped || []); setReview(null); setCompleted(false); setEventAttempt(null); setMinimizedFor(null); setAnchor(null); setProgressRevision(revision); }, [revision]);
  const acknowledge = useCallback((id: GuideId) => {
    const next = seen.includes(id) ? seen : [...seen, id];
    setReview(null);
    setSeen(next);
    saveGuideProgress({ active: true, seen: next, ...(lesson ? { task: lesson, skipped: skipped.filter(item => item !== id) } : {}) });
  }, [seen, skipped, lesson]);
  const skip = (id: GuideId) => {
    if (review) { setReview(null); return; }
    if (!lesson) { acknowledge(id); return; }
    const next = skipped.includes(id) ? skipped : [...skipped, id];
    setReview(null); setSkipped(next);
    saveGuideProgress({ active: true, seen, skipped: next, task: lesson });
  };
  useEffect(() => {
    if (!progressReady || !active || paused || !lesson || !steps.length || completed || !steps.every(id => seen.includes(id) || skipped.includes(id))) return;
    setCompleted(true);
    saveGuideProgress({ active: false, seen, skipped, task: lesson });
    (onComplete || onStop)();
  }, [progressReady, active, paused, lesson, steps, seen, skipped, completed, onComplete, onStop]);
  useEffect(() => {
    if (!card) return;
    const measure = () => setCardHeight(Math.ceil(card.getBoundingClientRect().height));
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(card);
    return () => observer?.disconnect();
  }, [card, anchor?.id, anchor?.width]);

  useEffect(() => {
    if (!progressReady || !active || paused || lesson !== 'events' || steps.find(id => !seen.includes(id) && !skipped.includes(id)) !== 'eventSave') return;
    const recordAttempt = (event: Event) => {
      const target = (event.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-guide="event-save"]');
      if (target && target.getAttribute('aria-pressed') !== 'true' && !target.closest('[inert], [aria-hidden="true"]')) setEventAttempt({ target, success: target.getAttribute('data-guide-save-success') });
    };
    // Track any genuinely clicked result, rather than requiring the first
    // highlighted event or accepting a previously saved item as new work.
    document.addEventListener('click', recordAttempt, true);
    return () => document.removeEventListener('click', recordAttempt, true);
  }, [progressReady, active, paused, lesson, steps, seen, skipped]);

  useEffect(() => {
    if (!progressReady || !active || paused) return;
    let frame = 0;
    const inspect = () => {
      frame = 0;
      let next: Anchor | null = null;
      const visible: Array<{ id: GuideId; target: HTMLElement; offscreen: boolean }> = [];
      const pending = lesson ? steps.find(id => !seen.includes(id) && !skipped.includes(id)) : undefined;
      const eligible = (element: HTMLElement) => {
        if (element.closest('[inert], [aria-hidden="true"], [hidden]') || !element.getClientRects().length) return false;
        const style = typeof window.getComputedStyle === 'function' ? window.getComputedStyle(element) : null;
        if (style?.visibility === 'hidden' || style?.visibility === 'collapse' || style?.display === 'none') return false;
        const rect = element.getBoundingClientRect();
        return rect.height > 0 && rect.width > 0;
      };
      // The details can close through X, Escape or native Back as well as the
      // lesson's Back to exploring button. Only a genuinely opened and saved
      // country supplies this completion state; never infer it from absence.
      if (lesson === 'inspiration' && !review && pending === 'exploreBack' && seen.includes('explorePlace') && seen.includes('exploreSave')
        && Array.from(document.querySelectorAll<HTMLElement>('[data-guide="explore-search"]')).some(target => eligible(target) && target.getAttribute('data-guide-return-complete') === 'true')) {
        acknowledge('exploreBack');
        return;
      }
      for (const item of targets) {
        if (lesson && item.id !== pending && item.id !== review) continue;
        // Keep navigation help out of a route's lazy-loading interval. The
        // destination/edit/save lesson appears only when its real control exists.
        if (['route', 'events', 'trips', 'companion'].includes(view) && ['plans', 'tools', 'community', 'profile'].includes(item.id)) continue;
        let candidates = Array.from(document.querySelectorAll<HTMLElement>(item.selector)).filter(eligible);
        if (lesson === 'events' && item.id === 'eventSave') {
          const savedAttempt = eventAttempt && candidates.find(target => target === eventAttempt.target);
          const success = savedAttempt?.getAttribute('data-guide-save-success');
          if (savedAttempt?.getAttribute('aria-pressed') === 'true' && success && success !== eventAttempt?.success) { acknowledge(item.id); return; }
          candidates = candidates.filter(target => target.getAttribute('aria-pressed') !== 'true');
          if (!candidates.length) candidates = Array.from(document.querySelectorAll<HTMLElement>('[data-guide="event-search"]')).filter(target => eligible(target) && ['empty', 'saved'].includes(target.getAttribute('data-guide-event-recovery') || ''));
        }
        // Only the confirmed-empty state exposes this recovery anchor. A
        // pending or failed cloud/device read must never be treated as empty.
        if (!candidates.length && lesson === 'saved' && item.id === 'savedRouteOpen') candidates = Array.from(document.querySelectorAll<HTMLElement>('[data-guide="saved-routes-empty"]')).filter(eligible);
        const inViewport = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const scrollHost = element.closest<HTMLElement>('.sheet-body');
          const clip = scrollHost?.getBoundingClientRect();
          const top = Math.max(0, clip?.top || 0);
          const bottom = Math.min(window.innerHeight, clip ? clip.top + clip.height : window.innerHeight);
          return rect.top >= top && rect.bottom <= bottom && rect.left >= 0 && rect.left + rect.width <= window.innerWidth;
        };
        const onscreen = candidates.find(inViewport);
        const target = onscreen || (lesson ? candidates[0] : undefined);
        if (target) visible.push({ id: item.id, target, offscreen: !onscreen });
      }
      let item = visible.find(item => item.id === review) || visible.find(item => !seen.includes(item.id));
      const searchTarget = lesson === 'inspiration' ? Array.from(document.querySelectorAll<HTMLElement>('[data-guide="explore-search"]')).find(eligible) : undefined;
      const searchState = searchTarget?.getAttribute('data-guide-discovery');
      let recovery: Anchor['recovery'] = lesson === 'inspiration' && ['exploreSearch', 'explorePlace'].includes(review || pending || '') && (searchState === 'empty' || searchState === 'route-only') ? searchState : undefined;
      // Missing or hidden controls are a waiting state, not a completed step.
      // Keep an escape from the lesson even during a lazy load or an empty search.
      const openSheet = Array.from(document.querySelectorAll<HTMLElement>('.sheet[role="dialog"]')).find(eligible);
      const blockedByDialog = targets.some(({ selector }) => Array.from(document.querySelectorAll<HTMLElement>(selector)).some(target => target.closest('[inert]')));
      if (!item && lesson && (review || pending) && (!blockedByDialog || openSheet)) {
        const host = openSheet || document.body;
        item = { id: review || pending!, target: searchTarget || host, offscreen: false };
        recovery ||= 'missing';
      }
      if (item) {
        const { target } = item;
        // Completion comes from the successful UI state, never from clicking
        // a button whose network/storage operation might still fail.
        if (!recovery && lesson && !review && item.id !== 'eventSave' && (target.getAttribute('data-guide-complete') === 'true' || (item.id === 'exploreSave' && target.getAttribute('aria-pressed') === 'true' && target.getAttribute('aria-busy') !== 'true'))) {
          acknowledge(item.id);
          return;
        }
        const host = target.closest?.<HTMLElement>('.sheet[role="dialog"]') || document.body;
        const bounds = host === document.body ? { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight } : host.getBoundingClientRect();
        const rect = target.getBoundingClientRect?.() || { ...bounds, bottom: bounds.top };
        const navigation = host === document.body ? Array.from(document.querySelectorAll<HTMLElement>('nav.bottom-nav')).find(element => !element.closest('[inert], [aria-hidden="true"]') && element.getClientRects().length) : null;
        const navigationTop = navigation?.getBoundingClientRect().top;
        const viewportBottom = window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : window.innerHeight;
        const availableBottom = Math.min(viewportBottom, bounds.top + bounds.height, typeof navigationTop === 'number' && navigationTop > 0 ? navigationTop : window.innerHeight);
        const availableHeight = Math.max(44, availableBottom - Math.max(0, bounds.top) - 24);
        const width = Math.min(332, bounds.width - 24);
        const left = Math.max(12, Math.min(bounds.width - width - 12, rect.left - bounds.left));
        const below = rect.bottom - bounds.top + 12;
        const cardBottom = availableBottom - bounds.top;
        const actualHeight = Math.min(cardHeight, availableHeight);
        const top = Math.max(12, Math.min(cardBottom - actualHeight - 12, item.offscreen || recovery === 'missing' ? cardBottom - actualHeight - 12 : below + actualHeight < cardBottom ? below : rect.top - bounds.top - actualHeight - 12));
        const previous = lesson ? [...steps.slice(0, steps.indexOf(item.id))].reverse().find(id => seen.includes(id) || skipped.includes(id)) : [...seen].reverse().find(id => id !== item.id && visible.some(candidate => candidate.id === id));
        const eventRecovery = target.getAttribute?.('data-guide-event-recovery');
        const bottomOffset = (host === document.body ? window.innerHeight : bounds.height) - (availableBottom - bounds.top) + 12;
        next = { id: item.id, target, host, top, bottomOffset, left, width, maxHeight: availableHeight, offscreen: item.offscreen, recovery, emptySaved: target.getAttribute?.('data-guide') === 'saved-routes-empty', eventRecovery: item.id === 'eventSave' && (eventRecovery === 'empty' || eventRecovery === 'saved') ? eventRecovery : undefined, previous };
      }
      setAnchor(previous => previous?.id === next?.id && previous?.target === next?.target && previous?.top === next?.top && previous?.bottomOffset === next?.bottomOffset && previous?.left === next?.left && previous?.width === next?.width && previous?.maxHeight === next?.maxHeight && previous?.offscreen === next?.offscreen && previous?.emptySaved === next?.emptySaved && previous?.eventRecovery === next?.eventRecovery && previous?.recovery === next?.recovery && previous?.previous === next?.previous ? previous : next);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(inspect); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['inert', 'aria-hidden', 'data-guide', 'aria-pressed', 'aria-busy', 'data-guide-complete', 'data-guide-return-complete', 'data-guide-discovery', 'data-guide-save-success', 'data-guide-event-recovery'] });
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    inspect();
    return () => { observer.disconnect(); document.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule); if (frame) window.cancelAnimationFrame(frame); };
  }, [progressReady, active, paused, seen, skipped, revision, view, review, cardHeight, lesson, steps, acknowledge, eventAttempt]);

  useEffect(() => {
    if (!progressReady || !anchor || !active || anchor.recovery) return;
    const { target, id } = anchor;
    const input = id === 'destination' || id === 'search' || id === 'toolSearch' || id === 'exploreSearch';
    // The card hides for the phone keyboard, but typing still completes a
    // genuine search task. Pausing must not disconnect that input listener.
    if (paused && !input) return;
    if (!paused && !keyboardOpen && !anchor.offscreen) target.classList.add('app-guide-target');
    const previousDescription = target.getAttribute('aria-describedby');
    if (!paused && !keyboardOpen && !anchor.offscreen) target.setAttribute('aria-describedby', [previousDescription, 'app-guide-description'].filter(Boolean).join(' '));
    const action = () => {
      if (anchor.emptySaved) return;
      if (lesson && id === 'eventSave') {
        if (!anchor.eventRecovery && target.getAttribute('aria-pressed') !== 'true') setEventAttempt({ target, success: target.getAttribute('data-guide-save-success') });
        return;
      }
      if (lesson && (id === 'exploreSearch' || id === 'exploreSave' || id === 'eventSearch' || id === 'travelCountry')) return;
      if (lesson && input && String((target as HTMLInputElement).value || '').trim().length < 2) return;
      acknowledge(id);
    };
    const event = input ? 'input' : 'click';
    target.addEventListener(event, action);
    return () => {
      target.classList.remove('app-guide-target'); target.removeEventListener(event, action);
      if (!paused && !keyboardOpen && !anchor.offscreen) {
        if (previousDescription) target.setAttribute('aria-describedby', previousDescription); else target.removeAttribute('aria-describedby');
      }
    };
  }, [progressReady, anchor, active, paused, keyboardOpen, acknowledge, lesson]);

  if (!progressReady || !active || paused || !anchor) return null;
  const content: Record<GuideId, { title: string; text: string; steps?: string[] }> = {
    eventSave: { title: copy('Bir etkinliği planına ekle', 'Save an event to your plan', 'Ruaj një aktivitet në plan'), text: copy('Bir etkinlikte Kaydet’e dokun. Kayıt başarıyla oluşunca kayıtlı etkinliklerini birlikte açacağız.', 'Tap Save on an event. Once it is saved successfully, we will open your saved events.', 'Prek Ruaj te një aktivitet. Pasi të ruhet me sukses, do të hapim aktivitetet e tua të ruajtura.') },
    exploreSearch: { title: copy('Keşfetmeye bir yerle başla', 'Start exploring with a place', 'Fillo zbulimin me një vend'), text: copy('Bir yeri inceleyip ülkesini favoriye ekleyecek, sonra Planlar → Ülkelerim’den yeniden açacağız. Arama kutusuna örneğin Tiran yaz. İncele düğmesi olan bir sonuç bulununca ilerleyeceğiz.', 'We will view a place, save its country as a favourite, then reopen it from Plans → My countries. Type Tirana in the search field, for example. We will continue when a result with a View button is found.', 'Do të shohim një vend, do ta ruajmë shtetin si të preferuar dhe do ta rihapim te Planet → Shtetet e mia. Shkruaj për shembull Tiranë në kërkim. Vazhdojmë kur të gjendet një rezultat me butonin Shiko.') },
    explorePlace: { title: copy('Bir yerin ayrıntısını aç', 'Open a place', 'Hap një vend'), text: copy('Sonuçtaki İncele düğmesine dokun. Açılan ayrıntılarda yerin öne çıkanlarını görebilir ve ülkesini favoriye ekleyebilirsin. Bu işlem rota oluşturmaz ve AI hakkını kullanmaz.', 'Tap View on the result. Its details show the highlights and let you save the country as a favourite. This does not create a route or use your AI allowance.', 'Prek Shiko te rezultati. Hollësitë tregojnë pikat kryesore dhe të lejojnë të ruash shtetin si të preferuar. Kjo nuk krijon itinerar dhe nuk përdor të drejtën e AI.') },
    exploreSave: { title: copy('Beğendiğin ülkeyi sakla', 'Keep a country you like', 'Ruaj një shtet që të pëlqen'), text: copy('Favoriye ekle düğmesine dokun. Kayıt başarıyla oluşunca sonraki adıma geçeceğiz.', 'Tap Add favourite. We will continue once it has been saved successfully.', 'Prek Shto në të preferuarat. Vazhdojmë pasi ruajtja të ketë sukses.') },
    exploreBack: { title: copy('Şimdi kaydını bulalım', 'Now find your saved country', 'Tani gjej shtetin e ruajtur'), text: copy('Ayrıntıları kapatıp keşfe dön. Ardından Planlar bölümünü açacağız.', 'Close the details and return to Explore. Then we will open Plans.', 'Mbyll hollësitë dhe kthehu te Zbulo. Pastaj do të hapim Planet.') },
    savedCountries: { title: copy('Favori ülkelerini aç', 'Open your favourite countries', 'Hap shtetet e preferuara'), text: copy('Planlar’daki Ülkelerim düğmesine dokun. Favoriye eklediğin ülkeler burada saklanır; ziyaret ettiğin ülkelerden farklı bir listedir.', 'Tap My countries in Plans. This is your wishlist of saved countries, separate from the countries you have visited.', 'Prek Shtetet e mia te Planet. Kjo është lista e shteteve të ruajtura, e veçantë nga shtetet që ke vizituar.') },
    savedCountryOpen: { title: copy('Kaydettiğin yere geri dön', 'Return to your saved place', 'Kthehu te vendi i ruajtur'), text: copy('Listeden kaydettiğin ülkeye dokun. Böylece bir yeri keşfetme, kaydetme ve tekrar bulma işlemini tamamlamış olacaksın.', 'Tap the country you saved. You have now learned how to discover, save and find a place again.', 'Prek shtetin që ruajte. Tani ke mësuar të zbulosh, ruash dhe gjesh përsëri një vend.') },
    savedRouteOpen: { title: copy('Kayıtlı rotanı aç', 'Open your saved route', 'Hap itinerarin e ruajtur'), text: copy('Bir rotada Planı aç düğmesine dokun. Örnek planlar adlarında “Eğitim örneği” olarak belirtilir.', 'Tap Open plan on a route. Lesson plans are labelled “Learning example” in their names.', 'Prek Hap planin te një itinerar. Planet mësimore shënohen “Shembull mësimor” në emër.') },
    travelCountry: { title: copy('Yardımı doğru ülkeye göre al', 'Choose the country for your tools', 'Zgjidh shtetin për mjetet'), text: copy('Bulunduğun veya gideceğin ülkeyi seç. Araçlar o ülkeye göre açılır; konum izni vermek zorunda değilsin.', 'Choose where you are or where you are going. Tools use that country; location permission is optional.', 'Zgjidh ku je ose ku po shkon. Mjetet përdorin atë shtet; leja e vendndodhjes është sipas dëshirës.') },
    travelTool: { title: copy('İhtiyacın olan aracı aç', 'Open the tool you need', 'Hap mjetin që të duhet'), text: copy('Sonuçtaki araca dokun. İnternetsiz hazırlık için “Çevrimdışı harita”yı açıp bir bölge indir; yalnızca indirildiği doğrulanan paket hazırdır.', 'Tap a tool in the results. To prepare for no internet, open Offline map and download an area. A pack is ready only after a confirmed download.', 'Prek një mjet te rezultatet. Për t’u përgatitur pa internet, hap Hartën pa internet dhe shkarko një zonë. Paketa është gati vetëm pas shkarkimit të konfirmuar.') },
    eventSearch: { title: copy('Tarihine uygun etkinlikleri bul', 'Find events for your dates', 'Gjej aktivitete për datat e tua'), text: copy('Yukarıdan ülke ve tarih seç, ardından “Etkinlikleri bul”a dokun. Şehir seçmek isteğe bağlı.', 'Choose a country and dates above, then tap Find events. Choosing a city is optional.', 'Zgjidh shtetin dhe datat më sipër, pastaj prek Gjej aktivitete. Qyteti është sipas dëshirës.') },
    eventSaved: { title: copy('Kaydettiğin etkinliklere dön', 'Return to your saved events', 'Kthehu tek aktivitetet e ruajtura'), text: copy('Beğendiğin etkinlikte Kaydet’e dokun. Kaydın oluştuğunda buradan veya Planlar’dan yeniden açabilirsin.', 'Tap Save on an event you like. Once saved, reopen it here or in Plans.', 'Prek Ruaj te aktiviteti që të pëlqen. Pasi të ruhet, hape këtu ose te Planet.') },
    library: { title: copy('Kaydını bul ve devam et', 'Find your saved plan', 'Gjej planin tënd të ruajtur'), text: copy('Rotalar’ı seç, bir planı aç. Haritada aç ve düzenle ile aynı rotayı değiştirebilirsin. Henüz kaydın yoksa Yeni rota ile başla.', 'Choose Routes, then open a plan. Open and edit on map lets you change the same route. If you have no saved plans, start with New route.', 'Zgjidh Itineraret dhe hap një plan. Hap dhe ndrysho në hartë të lejon ta ndryshosh. Pa plane të ruajtura, fillo me Itinerar i ri.') },
    toolSearch: { title: copy('İhtiyacını yaz, aracı aç', 'Find the tool you need', 'Gjej mjetin që të duhet'), text: copy('“Eczane”, “çeviri” veya “döviz” yaz. Çıkan araca dokun; yer gereken araçlarda gideceğin ülkeyi seçebilirsin.', 'Type “pharmacy”, “translation” or “currency”, then tap a tool. Select your destination country when a tool needs it.', 'Shkruaj “farmaci”, “përkthim” ose “monedha”, pastaj prek mjetin. Zgjidh shtetin kur nevojitet.') },
    search: { title: copy('Ne arıyorsun?', 'What are you looking for?', 'Çfarë po kërkon?'), text: copy('Şehirleri ve uygulamadaki özellikleri buradan bulabilirsin.', 'Find destinations and app features from this search box.', 'Gjej destinacione dhe veçori nga kjo fushë kërkimi.'), steps: [copy('“İst” yaz; İstanbul önerisine dokun.', 'Type “Ist”, then tap the Istanbul suggestion.', 'Shkruaj “Ist” dhe prek sugjerimin Stamboll.'), copy('“Etkinlik” veya “döviz” yaz; çıkan aracı doğrudan aç.', 'Type “events” or “currency” to open that tool directly.', 'Shkruaj “aktivitete” ose “monedha” për ta hapur mjetin.') ] },
    start: { title: copy('İlk rotanı oluştur', 'Create your first route', 'Krijo itinerarin tënd të parë'), text: copy('Rota’ya dokun; kısa sorularla sana uygun günlük program hazırlayalım.', 'Tap Route to build a daily itinerary with a few short questions.', 'Prek Itinerar për të krijuar një program ditor me disa pyetje.'), steps: [copy('Gideceğin yeri, gün sayısını ve gezi tercihlerini seç.', 'Choose your destination, number of days and travel preferences.', 'Zgjidh destinacionin, numrin e ditëve dhe preferencat.'), copy('Rotan hazır olduğunda durakları haritada düzenleyip kaydet.', 'When your route is ready, adjust its stops on the map and save it.', 'Kur itinerari të jetë gati, ndrysho ndalesat në hartë dhe ruaje.')] },
    events: { title: copy('Etkinlik Radarı’nı keşfet', 'Discover Event Radar', 'Zbulo Radarin e aktiviteteve'), text: copy('Seyahat tarihindeki konserleri, festivalleri ve diğer etkinlikleri burada ara.', 'Find concerts, festivals and other events during your trip.', 'Gjej koncerte, festivale dhe aktivitete gjatë udhëtimit.'), steps: [copy('Ülkeyi, istersen şehri ve tarih aralığını seç; “Etkinlikleri bul”a dokun.', 'Choose a country, optional city and dates, then tap Find events.', 'Zgjidh shtetin, qytetin sipas dëshirës dhe datat; prek Gjej aktivitete.'), copy('Bir etkinliği kaydet veya tarihleri uygun seyahatine ekle.', 'Save an event or add it to a trip with matching dates.', 'Ruaj një aktivitet ose shtoje në një udhëtim me data përkatëse.')] },
    destination: { title: copy('Gideceğin yeri seç', 'Choose where to go', 'Zgjidh ku do të shkosh'), text: copy('Bir şehir, ilçe veya mahalle yaz. Açılan öneriye dokun; sonra gününü ve tercihlerini seç.', 'Type a city, district or neighbourhood. Tap a suggestion, then choose your days and preferences.', 'Shkruaj qytet, zonë ose lagje. Prek një sugjerim, pastaj zgjidh ditët dhe preferencat.') },
    days: { title: copy('Programını gün gün incele', 'Review each day', 'Shiko çdo ditë'), text: copy('Bir güne dokununca yalnız o günün durakları ve rotası görünür.', 'Tap a day to see its stops and route.', 'Prek një ditë për të parë ndalesat dhe itinerarin e saj.'), steps: [copy('Diğer günleri görmek için gün şeridini yana kaydır.', 'Swipe the day strip sideways to reach later days.', 'Rrëshqit shiritin anash për të parë ditët e tjera.'), copy('“Genel” tüm günleri gösterir. Alt paneli tutamacından büyütüp programı oku.', 'Overview shows all days. Expand the bottom panel with its handle to read the itinerary.', 'Përmbledhja tregon të gjitha ditët. Zmadho panelin nga doreza për të lexuar programin.'), copy('Numaralı işaretler rotandaki duraklardır. Diğer simgeler yakındaki yerlerin türünü gösterir; bir gruba dokunarak yakınlaş.', 'Numbered markers are your route stops. Other symbols show nearby place types; tap a group to zoom in.', 'Shenjat me numra janë ndalesat e tua. Simbolet e tjera tregojnë llojet e vendeve pranë; prek një grup për t’u afruar.')] },
    edit: { title: copy('Rotanı kendine göre düzenle', 'Make the route yours', 'Përshtate itinerarin'), text: copy('Bir durağa dokunarak süresini ve notunu değiştir. Haritadan yeni yerler de ekleyebilirsin.', 'Tap a stop to change its duration and note. You can add more places from the map.', 'Prek një ndalesë për të ndryshuar kohëzgjatjen dhe shënimin. Mund të shtosh vende nga harta.') },
    discover: { title: copy('Rotana yeni bir yer ekle', 'Add a place to your route', 'Shto një vend në itinerar'), text: copy('“Mekânları keşfet” bölümünde haritadaki yerleri incele.', 'Use Discover places to explore places on the map.', 'Përdor Zbulo vende për të parë vendet në hartë.'), steps: [copy('Haritayı istediğin bölgeye taşı, ardından “Bu bölgede ara”ya dokun.', 'Move the map to your area, then tap Search this area.', 'Lëviz hartën te zona e dëshiruar dhe prek Kërko në këtë zonë.'), copy('Bir yeri aç, eklemek istediğin günü seç ve programına ekle.', 'Open a place, choose the day and add it to your itinerary.', 'Hap një vend, zgjidh ditën dhe shtoje në program.')] },
    save: { title: copy('Rotanı kaydet', 'Save your route', 'Ruaj itinerarin'), text: copy('Bu düğme planını saklar. Kaydettiğinde Planlar bölümünden tekrar açabilirsin.', 'This button keeps your plan. Once saved, reopen it from Plans.', 'Ky buton ruan planin. Pasi ta ruash, hape përsëri te Planet.') },
    plans: { title: copy('Planların burada', 'Your plans live here', 'Planet e tua janë këtu'), text: copy('Kaydettiğin rotaları Planlar’dan aç. Yeni rota oluşturmak için de buradan başlayabilirsin.', 'Open your saved routes in Plans. You can also start a new route here.', 'Hap itineraret e ruajtura te Planet. Këtu mund të fillosh edhe një itinerar të ri.') },
    community: { title: copy('Gezginlerden yardım al', 'Ask other travellers', 'Pyet udhëtarët e tjerë'), text: copy('Topluluk’ta ülke seçip soruları incele; bir konuya dokunarak cevapları oku.', 'Choose a country in Community and browse questions. Tap a topic to read its replies.', 'Zgjidh një shtet te Komuniteti dhe shfleto pyetjet. Prek një temë për përgjigjet.'), steps: [copy('Soru sormak veya cevap yazmak için giriş yap.', 'Sign in to ask a question or write a reply.', 'Hyr për të bërë pyetje ose për të shkruar përgjigje.')] },
    tools: { title: copy('Yoldayken Araçlar’a bak', 'Find help in Tools', 'Gjej ndihmë te Mjetet'), text: copy('Harita, çeviri ve para çevirici burada. İhtiyacın olan aracın adına dokun.', 'Maps, translation and the currency converter are here. Tap the tool you need.', 'Hartat, përkthimi dhe këmbimi valutor janë këtu. Prek mjetin që të duhet.') },
    profile: { title: copy('Ayarların ve yardımın burada', 'Your settings and help', 'Cilësimet dhe ndihma jote'), text: copy('Hesabını ve tercihlerini Profil’den yönet. Dili üstteki bayrak düğmesinden değiştirebilirsin.', 'Manage your account and preferences in Profile. Change the language using the flag button at the top.', 'Menaxho llogarinë dhe preferencat te Profili. Ndrysho gjuhën nga butoni i flamurit lart.'), steps: [copy('Bu rehberi yeniden açmak için Profil → Tercihler ve gizlilik → Uygulama ve yardım → Nasıl kullanılır? yolunu izle.', 'Reopen this guide from Profile → Preferences & privacy → App & help → How to use the app.', 'Rihap këtë udhëzues te Profili → Preferencat dhe privatësia → Aplikacioni dhe ndihma → Si përdoret aplikacioni?')] },
  };
  const tip: { title: string; text: string; steps?: string[] } = anchor.recovery === 'route-only' ? {
    title: copy('Bu sonuç hazır bir rota', 'This result is a ready-made route', 'Ky rezultat është itinerar i gatshëm'),
    text: copy('Planla düğmesi bu rotayı açar. Bu derste ise bir ülkeyi favoriye eklemeyi öğreniyoruz. Aramayı Tiran olarak değiştir; İncele düğmesini birlikte kullanacağız. Hazır rotayla devam etmek istersen eğitimi kapatabilirsin.', 'Plan opens this route. This lesson teaches you to save a country as a favourite. Change the search to Tirana so we can use View. You can close the lesson if you prefer to continue with the ready-made route.', 'Planifiko hap këtë itinerar. Ky mësim të mëson të ruash një shtet si të preferuar. Ndrysho kërkimin në Tiranë që të përdorim Shiko. Mund ta mbyllësh mësimin për të vazhduar me itinerarin e gatshëm.'),
  } : anchor.recovery === 'empty' ? {
    title: copy('Bu aramada hazır bir yer bulunamadı', 'No ready-made place matched this search', 'Nuk u gjet vend i gatshëm për këtë kërkim'),
    text: copy('Arama kutusuna Tiran yazmayı dene. Sonuçtaki İncele düğmesiyle ülkeyi kaydetmeyi öğrenebiliriz. Araman ve rota taslağın silinmez; bu adımı geçebilir veya eğitimi kapatabilirsin.', 'Try typing Tirana in the search field. We can use View on that result to learn how to save the country. Your route draft stays intact; you can skip this step or close the lesson.', 'Provo të shkruash Tiranë në kërkim. Përdorim Shiko te rezultati për të mësuar ruajtjen e shtetit. Drafti yt ruhet; mund ta kalosh hapin ose ta mbyllësh mësimin.'),
  } : anchor.recovery === 'missing' ? {
    title: content[anchor.id].title,
    text: copy('Bu adımın kontrolü şu an bu ekranda açık değil.', 'The control for this step is not open on this screen.', 'Kontrolli për këtë hap nuk është i hapur në këtë ekran.'),
    steps: [content[anchor.id].text, copy('Önceki ipucuna dönebilir, bu adımı geçebilir veya eğitimi kapatabilirsin. Hiçbir kayıt değiştirilmez.', 'You can return to the previous tip, skip this step or close the lesson. No records are changed.', 'Mund të kthehesh te këshilla e mëparshme, ta kalosh hapin ose ta mbyllësh mësimin. Asnjë regjistrim nuk ndryshon.')],
  } : anchor.eventRecovery ? {
    title: anchor.eventRecovery === 'empty' ? copy('Son aramada etkinlik bulunamadı', 'Your last search found no events', 'Kërkimi i fundit nuk gjeti aktivitete') : copy('Bu sonuçlar zaten kayıtlı', 'These results are already saved', 'Këto rezultate janë tashmë të ruajtura'),
    text: copy('Ülkeyi, tarihleri veya kategoriyi değiştirip Etkinlikleri bul’a dokun. Kaydetmeyi denemek için yeni bir sonuç seçebilir veya bu adımı geçebilirsin.', 'Change the country, dates or category and tap Find events. Choose a new result to try saving, or skip this step.', 'Ndrysho shtetin, datat ose kategorinë dhe prek Gjej aktivitete. Zgjidh një rezultat të ri për të provuar ruajtjen ose kalo këtë hap.'),
  } : anchor.emptySaved ? {
    title: copy('Henüz kayıtlı bir rotan yok', 'You do not have a saved route yet', 'Ende nuk ke një itinerar të ruajtur'),
    text: copy('AI hakkını kullanmadan hazır örnek üzerinden kaydetmeyi ve kaydını açmayı öğrenebilirsin. Mevcut rota seçimlerin korunur.', 'Learn how to save and reopen a ready example without using your AI allowance. Your own route choices are kept.', 'Mëso të ruash dhe rihapësh një shembull të gatshëm pa përdorur të drejtën e AI. Zgjedhjet e itinerarit tënd ruhen.'),
  } : content[anchor.id];
  if (minimized) return createPortal(<aside ref={setCard} className="app-guide-card app-guide-minimized" role="region" aria-label={copy('Eğitim ilerlemesi', 'Lesson progress', 'Përparimi i mësimit')} style={{ position: anchor.host === document.body ? 'fixed' : 'absolute', bottom: anchor.bottomOffset, left: anchor.left, width: anchor.width, maxHeight: anchor.maxHeight }}>
    <span>{steps.filter(id => seen.includes(id)).length}/{steps.length}</span>
    <span id="app-guide-description" className="sr-only">{tip.text}</span>
    <button type="button" onClick={() => { if (keyboardOpen) (document.activeElement as HTMLElement | null)?.blur?.(); setMinimizedFor(null); }}>{copy('Rehberi göster', 'Show guide', 'Shfaq udhëzuesin')}</button>
    <button type="button" onClick={() => skip(anchor.id)}>{copy('Atla', 'Skip', 'Kalo')}</button>
    <button type="button" onClick={onStop} aria-label={copy('Turu kapat', 'Close tour', 'Mbyll udhëzuesin')}><Icon name="close" size={17}/></button>
  </aside>, anchor.host);
  return createPortal(<aside ref={setCard} className={`app-guide-card${anchor.offscreen ? ' app-guide-offscreen' : ''}`} role="region" aria-label={copy('Uygulamayı tanı', 'Get to know the app', 'Njihu me aplikacionin')} style={{ position: anchor.host === document.body ? 'fixed' : 'absolute', top: anchor.top, left: anchor.left, width: anchor.width, maxHeight: anchor.maxHeight }}>
    <div className="app-guide-meta"><span>{lesson ? copy(`${steps.filter(id => seen.includes(id)).length}/${steps.length} görev tamamlandı`, `${steps.filter(id => seen.includes(id)).length}/${steps.length} tasks completed`, `${steps.filter(id => seen.includes(id)).length}/${steps.length} detyra të përfunduara`) : copy(`${seen.length}/${GUIDE_IDS.length} ipucu keşfedildi`, `${seen.length}/${GUIDE_IDS.length} tips explored`, `${seen.length}/${GUIDE_IDS.length} këshilla të eksploruara`)}</span><button type="button" onClick={onStop} aria-label={copy('Turu kapat', 'Close tour', 'Mbyll udhëzuesin')}><Icon name="close" size={17}/></button></div>
    <div className="app-guide-heading"><Icon name="sparkles" size={19}/><strong>{tip.title}</strong></div>
    <p id="app-guide-description">{anchor.offscreen ? copy('Sıradaki adım bu sayfanın başka bir yerinde. Adımı göster ile ilgili bölüme gidebilirsin.', 'The next step is elsewhere on this page. Show the step takes you to its control.', 'Hapi tjetër është diku tjetër në këtë faqe. Shfaq hapin të çon te mjeti përkatës.') : tip.text}</p>
    {!anchor.offscreen && tip.steps && <><button className="app-guide-details" type="button" aria-expanded={expanded} aria-controls="app-guide-steps" onClick={() => setExpanded(value => !value)}>{copy('Nasıl yaparım?', 'How do I do this?', 'Si ta bëj?')}<Icon name="chevron" size={14}/></button>{expanded && <ol id="app-guide-steps">{tip.steps.map(step => <li key={step}>{step}</li>)}</ol>}</>}
    {anchor.recovery === 'missing' && <p className="app-guide-waiting-step">{content[anchor.id].text}</p>}
    {lesson && !anchor.recovery && !anchor.offscreen && !anchor.emptySaved && !anchor.eventRecovery && <p className="app-guide-task-note">{copy('Görevi ekrandaki gerçek araçla tamamla. Hazır değilsen bu adımı geçebilirsin.', 'Complete the task with the real control on the screen. You can skip this step if you prefer.', 'Përfundo detyrën me mjetin në ekran. Mund ta kalosh hapin nëse dëshiron.')}</p>}
    <div className="app-guide-actions"><button type="button" disabled={!anchor.previous} onClick={() => anchor.previous && setReview(anchor.previous)}>{copy('Geri', 'Back', 'Prapa')}</button><button type="button" onClick={() => skip(anchor.id)}>{copy('Atla', 'Skip', 'Kalo')}</button>{anchor.recovery !== 'missing' && <button type="button" className="app-guide-next" onClick={() => {
      if (anchor.recovery) { setMinimizedFor({ id: anchor.id, target: anchor.target, revision }); anchor.target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' }); anchor.target.focus({ preventScroll: true }); return; }
      if (anchor.emptySaved && !anchor.offscreen) { (onOpenExample || onStop)(); return; }
      if (anchor.eventRecovery && !anchor.offscreen) {
        setMinimizedFor({ id: anchor.id, target: anchor.target, eventRecovery: anchor.eventRecovery, revision });
        const control = anchor.target.closest<HTMLElement>('.event-search-card')?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])') || anchor.target;
        control.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' }); control.focus({ preventScroll: true }); return;
      }
      if (!lesson) acknowledge(anchor.id);
      else if (!anchor.offscreen) setMinimizedFor({ id: anchor.id, target: anchor.target, eventRecovery: anchor.eventRecovery, revision });
      if (anchor.offscreen) anchor.target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      anchor.target.focus({ preventScroll: true });
    }}>{anchor.recovery ? copy('Aramayı düzenle', 'Edit search', 'Ndrysho kërkimin') : anchor.offscreen ? copy('Adımı göster', 'Show the step', 'Shfaq hapin') : anchor.eventRecovery ? copy('Filtreleri göster', 'Show filters', 'Shfaq filtrat') : anchor.emptySaved ? onOpenExample ? copy('Örnekle öğren', 'Learn with an example', 'Mëso me një shembull') : copy('Turu kapat', 'Close tour', 'Mbyll udhëzuesin') : lesson ? copy('Deneyeyim', 'Let me try', 'Ta provoj') : copy('Anladım', 'Got it', 'E kuptova')}<Icon name={lesson ? 'chevron' : 'check'} size={16}/></button>}</div>
    {!anchor.offscreen && <button className="app-guide-restart" type="button" onClick={() => { setReview(null); setSeen([]); setSkipped([]); setCompleted(false); setEventAttempt(null); setMinimizedFor(null); saveGuideProgress({ active: true, seen: [], ...(lesson ? { task: lesson, skipped: [] } : {}) }); }}>{copy('Rehberi baştan başlat', 'Restart guide', 'Rifillo udhëzuesin')}</button>}
  </aside>, anchor.host);
}
