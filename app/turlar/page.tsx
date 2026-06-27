import type { Metadata } from "next";
import { siteSettings, withUtm } from "@/lib/affiliate";

export const metadata: Metadata = { title: "Turlar ve Aktiviteler", description: "Şehir turları, müze biletleri ve günlük aktiviteler." };

const tourTypes = [
  { title: "Şehir turları", text: "İlk gün şehir merkezini hızlı tanımak için iyi bir başlangıçtır." },
  { title: "Müze ve giriş biletleri", text: "Yoğun sezonda sıra beklemeyi azaltan seçenekler kullanıcıya değer katar." },
  { title: "Deneyimler", text: "Tekne turu, yemek turu veya günlük gezi gibi yüksek dönüşüm potansiyeli olan alanlar." },
];

export default function ToursPage() {
  return (
    <section className="l2t-page l2t-wrap">
      <div className="l2t-split">
        <div>
          <p className="l2t-kicker">Aktiviteler</p>
          <h1>Gittiğin şehirde zamanı daha iyi kullan</h1>
          <p className="l2t-lead">Turlar ve aktiviteler sayfası, uçuş ve otelden sonra üçüncü gelir kanalı olarak çalışır. Kullanıcı, planına uygun deneyimi seçmek için partner sayfasına yönlenir.</p>
          <a className="l2t-btn" href={withUtm(siteSettings.getYourGuideAffiliateUrl)} target="_blank" rel="noreferrer">Aktiviteleri incele</a>
        </div>
        <div className="l2t-feature-list">
          <article><strong>Zaman kazandırır</strong><span>Popüler aktiviteleri önceden planlama avantajı sunar.</span></article>
          <article><strong>Yorum bazlı seçim</strong><span>Tur kalitesini değerlendirmek daha kolay olur.</span></article>
          <article><strong>Mobil bilet</strong><span>Çoğu aktivite telefon üzerinden gösterilebilir.</span></article>
        </div>
      </div>

      <div className="l2t-comparison-grid">
        {tourTypes.map((tour) => (
          <article className="l2t-comparison-card" key={tour.title}>
            <h3>{tour.title}</h3>
            <p>{tour.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
