import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../lib/i18n';
import { readGuideProgress, saveGuideProgress, type GuideId } from '../lib/appGuide';
import { Icon } from './Icon';
import './app-guide.css';

type Anchor = { id: GuideId; target: HTMLElement; host: HTMLElement; top: number; left: number; width: number };
const targets: Array<{ id: GuideId; selector: string }> = [
  { id: 'destination', selector: '[data-guide="journey-destination"]' },
  { id: 'edit', selector: '[data-guide="journey-edit"]' },
  { id: 'save', selector: '[data-guide="journey-save"]' },
  { id: 'plans', selector: '[data-guide="nav-plans"]' },
  { id: 'tools', selector: '[data-guide="nav-tools"]' },
];

/** Non-modal help follows genuine controls; it never creates or saves a plan for the user. */
export function AppGuide({ active, revision, paused, view, onStop }: { active: boolean; revision: number; paused: boolean; view: string; onStop: () => void }) {
  const { copy } = useI18n();
  const [seen, setSeen] = useState(() => readGuideProgress().seen);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  useEffect(() => { setSeen(readGuideProgress().seen); }, [revision]);

  useEffect(() => {
    if (!active || paused) return;
    let frame = 0;
    const inspect = () => {
      frame = 0;
      let next: Anchor | null = null;
      for (const item of targets) {
        // Keep navigation help out of a route's lazy-loading interval. The
        // destination/edit/save lesson appears only when its real control exists.
        if (seen.includes(item.id) || (view === 'route' && (item.id === 'plans' || item.id === 'tools'))) continue;
        const target = Array.from(document.querySelectorAll<HTMLElement>(item.selector)).find(element => {
          if (element.closest('[inert], [aria-hidden="true"]') || !element.getClientRects().length) return false;
          const rect = element.getBoundingClientRect();
          return rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
        });
        if (!target) continue;
        const host = target.closest<HTMLElement>('.sheet[role="dialog"]') || document.body;
        const rect = target.getBoundingClientRect();
        const bounds = host === document.body ? { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight } : host.getBoundingClientRect();
        const width = Math.min(332, bounds.width - 24);
        const left = Math.max(12, Math.min(bounds.width - width - 12, rect.left - bounds.left));
        const below = rect.bottom - bounds.top + 12;
        const top = Math.max(12, Math.min(bounds.height - 190, below + 180 < bounds.height ? below : rect.top - bounds.top - 184));
        next = { id: item.id, target, host, top, left, width }; break;
      }
      setAnchor(previous => previous?.id === next?.id && previous?.target === next?.target && previous?.top === next?.top && previous?.left === next?.left && previous?.width === next?.width ? previous : next);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(inspect); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['inert', 'aria-hidden', 'data-guide'] });
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    inspect();
    return () => { observer.disconnect(); document.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); if (frame) window.cancelAnimationFrame(frame); };
  }, [active, paused, seen, revision, view]);

  const acknowledge = useCallback((id: GuideId) => {
    const next = seen.includes(id) ? seen : [...seen, id];
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
    const event = id === 'destination' ? 'input' : 'click';
    target.addEventListener(event, action, { once: true });
    return () => {
      target.classList.remove('app-guide-target'); target.removeEventListener(event, action);
      if (previousDescription) target.setAttribute('aria-describedby', previousDescription); else target.removeAttribute('aria-describedby');
    };
  }, [anchor, active, paused, acknowledge]);

  if (!active || paused || !anchor) return null;
  const content: Record<GuideId, { title: string; text: string }> = {
    destination: { title: copy('Gideceğin yeri seç', 'Choose where to go', 'Zgjidh ku do të shkosh'), text: copy('Bir şehir, ilçe veya mahalle yaz. Açılan öneriye dokun; sonra gününü ve tercihlerini seç.', 'Type a city, district or neighbourhood. Tap a suggestion, then choose your days and preferences.', 'Shkruaj qytet, zonë ose lagje. Prek një sugjerim, pastaj zgjidh ditët dhe preferencat.') },
    edit: { title: copy('Rotanı kendine göre düzenle', 'Make the route yours', 'Përshtate itinerarin'), text: copy('Bir durağa dokunarak süresini ve notunu değiştir. Haritadan yeni yerler de ekleyebilirsin.', 'Tap a stop to change its duration and note. You can add more places from the map.', 'Prek një ndalesë për të ndryshuar kohëzgjatjen dhe shënimin. Mund të shtosh vende nga harta.') },
    save: { title: copy('Rotanı kaydet', 'Save your route', 'Ruaj itinerarin'), text: copy('Bu düğme planını saklar. Kaydettiğinde Planlar bölümünden tekrar açabilirsin.', 'This button keeps your plan. Once saved, reopen it from Plans.', 'Ky buton ruan planin. Pasi ta ruash, hape përsëri te Planet.') },
    plans: { title: copy('Planların burada', 'Your plans live here', 'Planet e tua janë këtu'), text: copy('Kaydettiğin rotaları Planlar’dan aç. Yeni rota oluşturmak için de buradan başlayabilirsin.', 'Open your saved routes in Plans. You can also start a new route here.', 'Hap itineraret e ruajtura te Planet. Këtu mund të fillosh edhe një itinerar të ri.') },
    tools: { title: copy('Yoldayken Araçlar’a bak', 'Find help in Tools', 'Gjej ndihmë te Mjetet'), text: copy('Harita, çeviri ve para çevirici burada. İhtiyacın olan aracın adına dokun.', 'Maps, translation and the currency converter are here. Tap the tool you need.', 'Hartat, përkthimi dhe këmbimi valutor janë këtu. Prek mjetin që të duhet.') },
  };
  const tip = content[anchor.id];
  return createPortal(<aside className="app-guide-card" role="region" aria-label={copy('Uygulamayı tanı', 'Get to know the app', 'Njihu me aplikacionin')} style={{ position: anchor.host === document.body ? 'fixed' : 'absolute', top: anchor.top, left: anchor.left, width: anchor.width }}>
    <div className="app-guide-heading"><Icon name="sparkles" size={19}/><strong>{tip.title}</strong></div>
    <p id="app-guide-description">{tip.text}</p>
    <div className="app-guide-actions"><button type="button" onClick={onStop}>{copy('Turu kapat', 'Close tour', 'Mbyll udhëzuesin')}</button><button type="button" className="app-guide-next" onClick={() => { acknowledge(anchor.id); anchor.target.focus({ preventScroll: true }); }}>{copy('Anladım', 'Got it', 'E kuptova')}<Icon name="check" size={16}/></button></div>
  </aside>, anchor.host);
}
