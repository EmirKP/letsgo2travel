import { useState } from 'react';
import { useI18n } from '../lib/i18n';
import { createGuideExample } from '../lib/guideExample';
import { getSavedRoutePlans, saveRoutePlan } from '../lib/storage';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import './app-guide.css';

/** The example is isolated from the user's planner. Only an explicit Save writes a real saved plan. */
export function RouteExampleLesson({ open, ownerId, onClose, onOpenSaved, onPlanOwn }: {
  open: boolean;
  ownerId?: string | null;
  onClose: () => void;
  onOpenSaved: (routeId: string) => void;
  onPlanOwn?: () => void;
}) {
  const { locale, copy } = useI18n();
  const example = createGuideExample(locale);
  const [day, setDay] = useState(0);
  const [reviewed, setReviewed] = useState(false);
  const [savedId, setSavedId] = useState('');
  const [error, setError] = useState('');

  function saveExample() {
    try {
      // Reopening a lesson must not overwrite edits to its previously saved example.
      const existing = getSavedRoutePlans(ownerId).find(item => item.id === example.id);
      const saved = existing || saveRoutePlan(example, ownerId)[0];
      setSavedId(saved.id);
      setError('');
    } catch {
      setSavedId('');
      setError(copy('Örnek kaydedilemedi. Cihazda yer açıp tekrar deneyebilirsin; mevcut planların korunuyor.', 'The example could not be saved. Free some device storage and retry. Your existing plans are kept.', 'Shembulli nuk u ruajt. Liro hapësirë në pajisje dhe provo përsëri. Planet ekzistuese ruhen.'));
    }
  }

  return <Sheet open={open} title={copy('Örnekle öğren', 'Learn with an example', 'Mëso me një shembull')} onClose={onClose} size="large">
    <div className="guide-example" data-guide="route-example">
      <p className="guide-example-label"><Icon name="sparkles" size={18}/>{copy('Örnek plan · AI hakkını kullanmaz', 'Example plan · Uses no AI allowance', 'Plan shembull · Nuk përdor të drejtën e AI')}</p>
      <h2>{copy('Bir planı açmayı, kaydetmeyi ve tekrar bulmayı dene', 'Try reviewing, saving and finding a plan', 'Provo të shikosh, ruash dhe gjesh një plan')}</h2>
      <p>{copy('Bu hazır Roma örneği, kendi rota taslağından ayrıdır. Yalnız Kaydet’e dokunursan Planlar’a eklenir.', 'This ready-made Rome example is separate from your own route draft. It is added to Plans only if you tap Save.', 'Ky shembull i Romës është i ndarë nga drafti yt. Shtohet te Planet vetëm nëse prek Ruaj.')}</p>
      <ol className="guide-example-checklist">
        <li className={reviewed ? 'is-complete' : ''}><span aria-hidden="true">{reviewed ? '✓' : '1'}</span>{copy('İkinci günü aç ve programı incele', 'Open the second day and review the itinerary', 'Hap ditën e dytë dhe shiko programin')}</li>
        <li className={savedId ? 'is-complete' : ''}><span aria-hidden="true">{savedId ? '✓' : '2'}</span>{copy('Örneği Planlar’a kaydet', 'Save the example to Plans', 'Ruaj shembullin te Planet')}</li>
        <li><span aria-hidden="true">3</span>{copy('Kaydını tekrar aç', 'Open your saved plan', 'Hap përsëri planin e ruajtur')}</li>
      </ol>
      <section className="guide-example-itinerary" aria-label={copy('Örnek günlük program', 'Example daily itinerary', 'Programi ditor shembull')}>
        <h3>{copy('Eğitim örneği · Roma', 'Learning example · Rome', 'Shembull mësimor · Romë')}</h3>
        <div className="guide-example-days" role="group" aria-label={copy('Örnek günler', 'Example days', 'Ditët shembull')}>{example.plan.routes[0].dailyPlan.map((_, index) => <button type="button" key={index} aria-pressed={day === index} onClick={() => { setDay(index); if (index === 1) setReviewed(true); }}>{copy(`${index + 1}. gün`, `Day ${index + 1}`, `Dita ${index + 1}`)}</button>)}</div>
        <p aria-live="polite">{example.plan.routes[0].dailyPlan[day]}</p>
      </section>
      {!reviewed && <p id="guide-example-review-hint">{copy('Yukarıdaki 2. gün düğmesine dokun; ardından kaydetmeyi deneyebilirsin.', 'Tap Day 2 above, then try saving the plan.', 'Prek Dita 2 më sipër, pastaj provo ta ruash planin.')}</p>}
      {error && <p role="alert" className="guide-example-error">{error}</p>}
      {savedId ? <div className="guide-example-saved" role="status"><p><Icon name="check" size={18}/>{copy('Örnek bu cihazda kayıtlı. Planlar → Rotalarım bölümünden açabilirsin.', 'Example saved on this device. Open it from Plans → My routes.', 'Shembulli u ruajt në këtë pajisje. Hape nga Planet → Itineraret e mia.')}</p><button type="button" className="primary-wide" onClick={() => onOpenSaved(savedId)}>{copy('Kaydettiğim örneği aç', 'Open my saved example', 'Hap shembullin tim të ruajtur')}<Icon name="chevron" size={18}/></button></div>
        : <button type="button" className="primary-wide" disabled={!reviewed} aria-describedby={!reviewed ? 'guide-example-review-hint' : undefined} onClick={saveExample}><Icon name="bookmark" size={18}/>{copy('Örneği Planlar’a kaydet', 'Save example to Plans', 'Ruaj shembullin te Planet')}</button>}
      <button type="button" className="secondary-wide guide-example-own" onClick={onPlanOwn || onClose}>{copy('Kendi rotamı planla', 'Plan my own route', 'Planifiko itinerarin tim')}</button>
    </div>
  </Sheet>;
}
