import type { Metadata } from "next";
import { siteSettings, trackedAffiliateUrl } from "@/lib/affiliate";

export const metadata: Metadata = { title: "Otel Bul", description: "Seyahat rotana göre otel ve konaklama seçenekleri." };

const hotelTips = [
  { title: "Konum", text: "İlk kez gidilen şehirlerde metro, merkez ve güvenli bölge dengesi önemlidir." },
  { title: "Yorum kalitesi", text: "Sadece puana değil, son yorumların temizlik ve ulaşım detaylarına bakılmalı." },
  { title: "Esnek iptal", text: "Vize, uçuş saati veya kampanya değişimlerinde ücretsiz iptal avantaj sağlar." },
];

export default function HotelsPage() {
  return (
    <section className="l2t-page l2t-wrap">
      <div className="l2t-split">
        <div>
          <p className="l2t-kicker">Konaklama</p>
          <h1>Otelini yorum, konum ve fiyat dengesine göre seç</h1>
          <p className="l2t-lead">Bu sayfa, kullanıcının uçak biletinden sonra en doğal ikinci ihtiyacı olan konaklamaya geçiş yapmasını sağlar. Booking affiliate linkin `.env` içine eklendiğinde gelir akışı çalışır.</p>
          <a className="l2t-btn" href={trackedAffiliateUrl({ provider: "booking", url: siteSettings.bookingAffiliateUrl, sourcePage: "hotels_page" })} target="_blank" rel="nofollow sponsored noreferrer">Otelleri karşılaştır</a>
        </div>
        <div className="l2t-feature-list">
          <article><strong>Merkezi bölgeler</strong><span>İlk seyahatte ulaşımı kolay, güvenli ve yorumlu bölgeler öne çıkar.</span></article>
          <article><strong>Fiyat alarmı mantığı</strong><span>Uçuş bulunduğunda otel fiyatı da aynı akışta kontrol edilebilir.</span></article>
          <article><strong>Affiliate uyumlu CTA</strong><span>Buton dış siteye yönlendirir; satış partner platformunda tamamlanır.</span></article>
        </div>
      </div>

      <div className="l2t-comparison-grid">
        {hotelTips.map((tip) => (
          <article className="l2t-comparison-card" key={tip.title}>
            <h3>{tip.title}</h3>
            <p>{tip.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
