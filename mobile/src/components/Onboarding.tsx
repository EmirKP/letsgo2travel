import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

const slides: Array<{ icon: IconName; eyebrow: string; title: string; text: string; points: string[] }> = [
  {
    icon: "compass",
    eyebrow: "BU UYGULAMA NE YAPAR?",
    title: "Önce gideceğin yeri birlikte buluruz.",
    text: "Türkiye pasaportuyla nerelere gidebileceğini gör, ülkeleri keşfet ve kararını kolaylaştır.",
    points: ["Ülke bul", "Giriş koşulunu gör", "Karar ver"],
  },
  {
    icon: "route",
    eyebrow: "SONRA PLANLARIZ",
    title: "Bütçene ve tarzına uygun bir rota hazırlarız.",
    text: "Nereden çıkacağını ve nasıl bir gezi istediğini seç; sana uygun seçenekleri gün gün gösterelim.",
    points: ["Bütçene uygun", "Gün gün plan", "Hava durumu"],
  },
  {
    icon: "suitcase",
    eyebrow: "YOLA ÇIKARKEN YANINDA",
    title: "Kaydet, takip et ve kaldığın yerden devam et.",
    text: "Rotaların, favorilerin ve kokpit kayıtların giriş yaptığında web hesabınla eşitlenir.",
    points: ["Tarihlerini takip et", "Uçuşunu kaydet", "Fiyat alarmı kur"],
  },
];

export function Onboarding({ onComplete }: { onComplete: () => void }) {
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
    <div ref={dialogRef} className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-orbit orbit-one" />
      <div className="onboarding-orbit orbit-two" />
      <header className="onboarding-header">
        <span className="onboarding-brand">LetsGo<strong>2</strong>Travel</span>
        <div>{index > 0 && <button onClick={() => setIndex((value) => value - 1)}>Geri</button>}{!last && <button onClick={onComplete}>Tanıtımı geç</button>}</div>
      </header>

      <section className="onboarding-content" key={index} aria-live="polite">
        <span className="onboarding-icon"><Icon name={slide.icon} size={42} /></span>
        <small>{slide.eyebrow}</small>
        <h1 id="onboarding-title">{slide.title}</h1>
        <p>{slide.text}</p>
        <div className="onboarding-points">
          {slide.points.map((point) => <span key={point}><Icon name="check" size={14} />{point}</span>)}
        </div>
      </section>

      <footer className="onboarding-footer">
        <div className="onboarding-dots" aria-label={`${index + 1} / ${slides.length}`}>
          {slides.map((item, dotIndex) => <span className={dotIndex === index ? "active" : ""} key={item.title} />)}
        </div>
        <button className="onboarding-next" onClick={() => last ? onComplete() : setIndex((value) => value + 1)}>
          {last ? "Keşfetmeye başla" : "Devam et"}<Icon name="chevron" size={18} />
        </button>
      </footer>
    </div>
  );
}
