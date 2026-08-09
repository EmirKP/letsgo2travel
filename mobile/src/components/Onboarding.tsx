import { useState } from "react";
import { Icon, type IconName } from "./Icon";

const slides: Array<{ icon: IconName; eyebrow: string; title: string; text: string; points: string[] }> = [
  {
    icon: "compass",
    eyebrow: "KEŞİF SENİNLE BAŞLAR",
    title: "Nereye gideceğini birlikte bulalım.",
    text: "Pasaport durumunu, ilham veren ülkeleri ve sana uygun rotaları tek bir mobil merkezde keşfet.",
    points: ["Pasaport Gücü", "Günün rotası", "Beni Şaşırt"],
  },
  {
    icon: "route",
    eyebrow: "AKILLI ROTA ASİSTANI",
    title: "Bütçene ve tarzına göre rota oluştur.",
    text: "Canlı asistan kullanılamasa bile güvenli yerel rota motoru çalışmaya devam eder.",
    points: ["Kişisel öneriler", "Örnek günlük plan", "Hava durumu"],
  },
  {
    icon: "suitcase",
    eyebrow: "SEYAHATLERİN TEK YERDE",
    title: "Kaydet, takip et ve kaldığın yerden devam et.",
    text: "Rotaların, favorilerin, aramaların ve kokpit kayıtların giriş yaptığında web hesabınla eşitlenir.",
    points: ["Seyahat Kokpiti", "Fiyat alarmları", "Kaşifler Ligi"],
  },
];

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const last = index === slides.length - 1;

  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-label="LetsGo2Travel tanıtımı">
      <div className="onboarding-orbit orbit-one" />
      <div className="onboarding-orbit orbit-two" />
      <header className="onboarding-header">
        <span className="onboarding-brand">LetsGo<strong>2</strong>Travel</span>
        {!last && <button onClick={onComplete}>Geç</button>}
      </header>

      <main className="onboarding-content" key={index}>
        <span className="onboarding-icon"><Icon name={slide.icon} size={42} /></span>
        <small>{slide.eyebrow}</small>
        <h1>{slide.title}</h1>
        <p>{slide.text}</p>
        <div className="onboarding-points">
          {slide.points.map((point) => <span key={point}><Icon name="check" size={14} />{point}</span>)}
        </div>
      </main>

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
