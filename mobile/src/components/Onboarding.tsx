import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { useI18n } from "../lib/i18n";
import { BrandMark } from "./BrandMark";
import { LanguageFlag } from './LanguagePicker';
import { APP_LOCALES } from '../lib/locale';

const SLIDES_SQ = [
  { eyebrow: 'ÇFARË BËN KY APLIKACION?', title: 'Së pari, gjejmë së bashku ku do të shkosh.', text: 'Shiko ku mund të udhëtosh me pasaportë turke, zbulo destinacione dhe vendos më lehtë.', points: ['Gjej një shtet', 'Shiko kushtet e hyrjes', 'Vendos'] },
  { eyebrow: 'PASTAJ PLANIFIKOJMË', title: 'Përgatisim një itinerar sipas buxhetit dhe stilit tënd.', text: 'Zgjidh nga nisesh dhe çfarë udhëtimi dëshiron; shiko mundësitë që të përshtaten, ditë pas dite.', points: ['Sipas buxhetit tënd', 'Plan për çdo ditë', 'Moti'] },
  { eyebrow: 'ME TY GJATË UDHËTIMIT', title: 'Ruaj, ndiq dhe vazhdo aty ku mbete.', text: 'Itineraret, ngjarjet dhe mjetet e udhëtimit i ke me vete gjatë gjithë rrugës.', points: ['Gjej ngjarje', 'Përdor shprehje vendase', 'Organizo fluturimin'] },
];

const slides: Array<{ icon: IconName; eyebrow: [string, string]; title: [string, string]; text: [string, string]; points: Array<[string, string]> }> = [
  {
    icon: "compass",
    eyebrow: ["BU UYGULAMA NE YAPAR?", "WHAT DOES THIS APP DO?"],
    title: ["Önce gideceğin yeri birlikte buluruz.", "First, we help you decide where to go."],
    text: ["Türkiye pasaportuyla nerelere gidebileceğini gör, ülkeleri keşfet ve kararını kolaylaştır.", "See where you can travel with a Turkish passport, explore destinations and decide with confidence."],
    points: [["Ülke bul", "Find a country"], ["Giriş koşulunu gör", "Check entry"], ["Karar ver", "Decide"]],
  },
  {
    icon: "route",
    eyebrow: ["SONRA PLANLARIZ", "THEN WE PLAN"],
    title: ["Bütçene ve tarzına uygun bir rota hazırlarız.", "We build a route around your budget and style."],
    text: ["Nereden çıkacağını ve nasıl bir gezi istediğini seç; sana uygun seçenekleri gün gün gösterelim.", "Choose where you leave from and the trip you want; see suitable options day by day."],
    points: [["Bütçene uygun", "Fits your budget"], ["Gün gün plan", "Day-by-day plan"], ["Hava durumu", "Weather"]],
  },
  {
    icon: "suitcase",
    eyebrow: ["YOLA ÇIKARKEN YANINDA", "WITH YOU ON THE ROAD"],
    title: ["Kaydet, takip et ve kaldığın yerden devam et.", "Save, track and continue where you left off."],
    text: ["Rotaların, etkinliklerin ve kokpit kayıtlarınla seyahat boyunca yanında oluruz.", "Routes, events and Cockpit tools stay with you throughout the trip."],
    points: [["Etkinlikleri bul", "Find events"], ["Yerel ifadeleri kullan", "Use local phrases"], ["Uçuşunu düzenle", "Organise your flight"]],
  },
];

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const { locale, setLocale, copy } = useI18n();
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const slide = slides[index];
  const last = index === slides.length - 1;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.querySelector<HTMLElement>(".onboarding-next")?.focus({ preventScroll: true });
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const lastItem = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", trapFocus);
    return () => dialog.removeEventListener("keydown", trapFocus);
  }, [index]);

  return (
    <div ref={dialogRef} className={`onboarding reference-onboarding onboarding-scene-${index}`} role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-orbit orbit-one" />
      <div className="onboarding-orbit orbit-two" />
      <header className="onboarding-header">
        <span className="onboarding-brand"><BrandMark /></span>
        <div><span className="onboarding-language-options" role="group" aria-label={copy('Uygulama dili', 'App language')}>
          {APP_LOCALES.map(language => <button key={language} type="button" aria-pressed={locale === language} aria-label={{tr:'Türkçe',en:'English',sq:'Shqip'}[language]} onClick={() => setLocale(language)}><LanguageFlag locale={language}/></button>)}
        </span>{index > 0 && <button onClick={() => setIndex((value) => value - 1)}>{copy("Geri", "Back")}</button>}{!last && <button onClick={onComplete}>{copy("Tanıtımı geç", "Skip intro")}</button>}</div>
      </header>

      <section className="onboarding-content" key={index} aria-live="polite">
        <span className="onboarding-icon"><Icon name={slide.icon} size={42} /></span>
        <small>{copy(...slide.eyebrow, SLIDES_SQ[index].eyebrow)}</small>
        <h1 id="onboarding-title">{copy(...slide.title, SLIDES_SQ[index].title)}</h1>
        <p>{copy(...slide.text, SLIDES_SQ[index].text)}</p>
        <div className="onboarding-points">
          {slide.points.map((point, pointIndex) => <span key={point[0]}><Icon name="check" size={14} />{copy(...point, SLIDES_SQ[index].points[pointIndex])}</span>)}
        </div>
      </section>

      <footer className="onboarding-footer">
        <div className="onboarding-dots" aria-label={`${index + 1} / ${slides.length}`}>
          {slides.map((item, dotIndex) => <span className={dotIndex === index ? "active" : ""} key={item.title[0]} />)}
        </div>
        <button className="onboarding-next" onClick={() => last ? onComplete() : setIndex((value) => value + 1)}>
          {last ? copy("Keşfetmeye başla", "Start exploring") : copy("Devam et", "Continue")}<Icon name="chevron" size={18} />
        </button>
      </footer>
    </div>
  );
}
