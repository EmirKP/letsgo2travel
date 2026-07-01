import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, Compass, MessageCircle, Plane, ShieldCheck } from "lucide-react";
import { getCountryGuides } from "@/lib/data";

export const metadata: Metadata = {
  title: "Ülke Rehberi",
  description: "Ülkelerin vize, uçuş, sezon, bütçe ve doğrulanmış gezgin notlarını gösteren Letsgo2Travel rehberi.",
};

export default async function CountryGuidesPage() {
  const countries = await getCountryGuides();
  return (
    <section className="l2t-page l2t-wrap">
      <div className="l2t-page-head">
        <p className="l2t-kicker">Ülke rehberleri</p>
        <h1>Rotanı bilinçli seç</h1>
        <p>Her ülke için vize durumu, uçuş süresi, iyi dönemler, başlangıç bütçesi ve gezgin yorumlarına tek ekrandan ulaş.</p>
      </div>

      <div className="l2t-guide-quick-actions" aria-label="Ülke rehberi hızlı aksiyonlar">
        <Link href="/vizesiz-ulkeler"><ShieldCheck size={18} /> Vizesiz / kimlikle rotaları gör</Link>
        <Link href="/ucak-bileti-ara"><Plane size={18} /> Uçak bileti ara</Link>
        <Link href="/fiyat-kontrolu"><BellRing size={18} /> Fiyat alarmı kur</Link>
        <Link href="/forum"><MessageCircle size={18} /> Gezginlere sor</Link>
      </div>

      <div className="l2t-guide-seo-band">
        <div>
          <p className="l2t-kicker">SEO + güven</p>
          <h2>Her rehberde karar vermeni kolaylaştıran bilgiler</h2>
        </div>
        <div className="l2t-guide-seo-items">
          <span><Compass size={16} /> Vize durumu</span>
          <span><Plane size={16} /> Ortalama uçuş süresi</span>
          <span><BellRing size={16} /> Fiyat takibi</span>
          <span><MessageCircle size={16} /> Topluluk yorumları</span>
        </div>
      </div>

      <div className="l2t-country-grid">
        {countries.map((country) => (
          <article className="l2t-country-card l2t-country-card-conversion" key={country.id}>
            <Link href={`/ulke-rehberi/${country.slug}`} className="l2t-country-card-main">
              <span>{country.emoji}</span>
              <h3>{country.country_name}</h3>
              <p>{country.visa_note}</p>
              <small>{country.best_months}</small>
            </Link>
            <div className="l2t-country-card-actions">
              <Link href={`/ulke-rehberi/${country.slug}`}>Rehberi oku</Link>
              <Link href={`/ucak-bileti-ara?to=${encodeURIComponent(country.airport_code || country.country_name)}`}>Bilet ara</Link>
              <Link href={`/forum/ulke/${country.slug}`}>Yorumlar</Link>
            </div>
          </article>
        ))}
      </div>


      <section className="l2t-country-guides-content-band" aria-labelledby="country-guides-seo-title">
        <p className="l2t-kicker">SEO rehber merkezi</p>
        <h2 id="country-guides-seo-title">Ülke seçerken sadece vize durumuna bakma</h2>
        <p>
          Vizesiz veya kimlikle gidilebilen bir ülke seçmek önemli ama tek başına yeterli değil. Uçuş süresi,
          toplam bütçe, şehir içi ulaşım, sezon yoğunluğu ve gerçek gezgin yorumları da rota kararını doğrudan etkiler.
        </p>
        <div className="l2t-country-guides-content-grid">
          <article>
            <h3>Vize ve giriş kontrolü</h3>
            <p>Her rehberde vize notu, kimlikle giriş kolaylığı ve seyahat öncesi kontrol edilmesi gereken belge hatırlatmaları bulunur.</p>
          </article>
          <article>
            <h3>Bütçe ve fiyat alarmı</h3>
            <p>Ortalama bilet fiyatını gördükten sonra hedef fiyat belirleyebilir, fiyat düştüğünde e-posta bildirimi alabilirsin.</p>
          </article>
          <article>
            <h3>Doğrulanmış gezgin ağı</h3>
            <p>Ülke forumlarından giden gezginlerin güncel deneyimlerine geçebilir, kendi seyahatini doğrulayıp cevap yazabilirsin.</p>
          </article>
        </div>
      </section>
    </section>
  );
}
