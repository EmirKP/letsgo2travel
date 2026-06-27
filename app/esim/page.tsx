import type { Metadata } from "next";
import { siteSettings, withUtm } from "@/lib/affiliate";

export const metadata: Metadata = { title: "Yurt Dışı eSIM", description: "Yurt dışı internet için eSIM paketleri ve öneriler." };

const steps = [
  { title: "Telefon uyumluluğu", text: "eSIM destekleyen cihazlarda fiziksel SIM aramadan paket kurulabilir." },
  { title: "Seyahatten önce kurulum", text: "Paket QR kodu veya uygulama üzerinden hazırlanır, varışta mobil veri açılır." },
  { title: "Roaming kontrolü", text: "Operatör roaming ücretleriyle karşılaştırıp kısa seyahat için daha mantıklı seçenek seçilir." },
];

export default function EsimPage() {
  return (
    <section className="l2t-page l2t-wrap">
      <div className="l2t-split">
        <div>
          <p className="l2t-kicker">Yurt dışı internet</p>
          <h1>eSIM ile seyahate internet hazır başla</h1>
          <p className="l2t-lead">Fiziksel SIM kart arama, mağaza bulma ve dil problemi yaşama riskini azalt. Kullanıcıyı affiliate bağlantılı eSIM sayfasına net bir fayda anlatımıyla yönlendir.</p>
          <a className="l2t-btn" href={withUtm(siteSettings.airaloAffiliateUrl)} target="_blank" rel="noreferrer">eSIM paketlerini gör</a>
        </div>
        <div className="l2t-feature-list">
          <article><strong>Hızlı kurulum</strong><span>QR kod veya uygulama ile etkinleştirme.</span></article>
          <article><strong>Roaming alternatifi</strong><span>Kısa seyahatlerde paket maliyetini önceden görme.</span></article>
          <article><strong>Varışta hazır internet</strong><span>Havalimanında taksi, harita ve mesajlaşma için internetin hazır olur.</span></article>
        </div>
      </div>

      <div className="l2t-comparison-grid">
        {steps.map((item) => (
          <article className="l2t-comparison-card" key={item.title}>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>

      <div className="l2t-soft-band">
        <p><strong>Not:</strong> eSIM satın almadan önce cihazının eSIM desteklediğini, paketin gideceğin ülkeyi kapsadığını ve kullanım süresini kontrol et.</p>
      </div>
    </section>
  );
}
