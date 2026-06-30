import Link from "next/link";
import { BellRing, Hotel, MapPinned, MessageCircle, Plane, ShieldCheck, Ticket, Wifi } from "lucide-react";
import type { CountryGuide } from "@/lib/types";
import { affiliateRedirectUrl, aviasalesUrl, siteSettings, trackedAffiliateUrl } from "@/lib/affiliate";

function flightLink(country: CountryGuide) {
  const rawFlightUrl = aviasalesUrl({ destination: country.airport_code || undefined });
  return affiliateRedirectUrl({
    provider: "aviasales",
    url: rawFlightUrl,
    destination: country.airport_code || country.country_name,
    sourcePage: `country_guide_${country.slug}`,
    campaign: "country_guide_cta",
  });
}

function bookingLink(country: CountryGuide) {
  return trackedAffiliateUrl({
    provider: "booking",
    url: siteSettings.bookingAffiliateUrl,
    destination: country.country_name,
    sourcePage: `country_guide_${country.slug}`,
    campaign: "country_guide_cta",
  });
}

function airaloLink(country: CountryGuide) {
  return trackedAffiliateUrl({
    provider: "airalo",
    url: siteSettings.airaloAffiliateUrl,
    destination: country.country_name,
    sourcePage: `country_guide_${country.slug}`,
    campaign: "country_guide_cta",
  });
}

function getYourGuideLink(country: CountryGuide) {
  return trackedAffiliateUrl({
    provider: "getyourguide",
    url: siteSettings.getYourGuideAffiliateUrl,
    destination: country.country_name,
    sourcePage: `country_guide_${country.slug}`,
    campaign: "country_guide_cta",
  });
}

export default function CountryGuideCtas({ country }: { country: CountryGuide }) {
  const forumHref = `/forum/ulke/${country.slug}`;
  const askHref = `/forum/yeni?country=${encodeURIComponent(country.slug)}&countryName=${encodeURIComponent(country.country_name)}&kategori=ulke-bazli-sorunlar&title=${encodeURIComponent(`${country.country_name} hakkında soru sormak istiyorum`)}`;
  const verifyHref = `/profil/dogrulama?country=${encodeURIComponent(country.slug)}`;
  const priceAlertHref = `/fiyat-kontrolu?to=${encodeURIComponent(country.airport_code || country.country_name)}`;

  return (
    <section className="l2t-wrap l2t-country-action-panel" aria-labelledby="country-actions-title">
      <div className="l2t-country-action-copy">
        <p className="l2t-kicker">Sıradaki adım</p>
        <h2 id="country-actions-title">{country.country_name} planını tamamla</h2>
        <p>
          Vize bilgisini gördün. Şimdi uçak bileti, konaklama, internet ve doğrulanmış gezgin yorumlarını tek yerden kontrol et.
        </p>
      </div>

      <div className="l2t-country-action-grid">
        <a className="l2t-country-action-card l2t-country-action-card-primary" href={flightLink(country)} target="_blank" rel="nofollow sponsored noreferrer">
          <span className="l2t-country-action-icon"><Plane size={22} /></span>
          <strong>Uçak bileti ara</strong>
          <small>{country.airport_code || country.country_name} rotası için fiyatları karşılaştır.</small>
          <em>Bilet ara →</em>
        </a>

        <a className="l2t-country-action-card" href={bookingLink(country)} target="_blank" rel="nofollow sponsored noreferrer">
          <span className="l2t-country-action-icon"><Hotel size={22} /></span>
          <strong>Otel bak</strong>
          <small>Konum, yorum ve ücretsiz iptal seçeneklerini kontrol et.</small>
          <em>Otellere bak →</em>
        </a>

        <a className="l2t-country-action-card" href={airaloLink(country)} target="_blank" rel="nofollow sponsored noreferrer">
          <span className="l2t-country-action-icon"><Wifi size={22} /></span>
          <strong>eSIM al</strong>
          <small>İnternet paketini seyahatten önce hazırla.</small>
          <em>eSIM paketleri →</em>
        </a>

        <a className="l2t-country-action-card" href={getYourGuideLink(country)} target="_blank" rel="nofollow sponsored noreferrer">
          <span className="l2t-country-action-icon"><Ticket size={22} /></span>
          <strong>Tur / aktivite gör</strong>
          <small>Popüler gezi, müze ve şehir turlarını incele.</small>
          <em>Aktiviteleri gör →</em>
        </a>

        <Link className="l2t-country-action-card l2t-country-action-card-community" href={forumHref}>
          <span className="l2t-country-action-icon"><MessageCircle size={22} /></span>
          <strong>Gezgin yorumlarını oku</strong>
          <small>{country.country_name} için doğrulanmış gezgin soruları ve cevapları.</small>
          <em>Foruma git →</em>
        </Link>

        <Link className="l2t-country-action-card" href={verifyHref}>
          <span className="l2t-country-action-icon"><ShieldCheck size={22} /></span>
          <strong>Ben de gittim, doğrula</strong>
          <small>Ülkeyi doğrula, yorum yazma ve Kaşifler Ligi puanı kazan.</small>
          <em>Doğrulama başlat →</em>
        </Link>
      </div>

      <div className="l2t-country-action-footer">
        <Link href={priceAlertHref}><BellRing size={16} /> Fiyat alarmı kur</Link>
        <Link href={askHref}><MessageCircle size={16} /> Bu ülke hakkında soru sor</Link>
        <Link href="/vizesiz-ulkeler"><MapPinned size={16} /> Benzer kolay rotaları gör</Link>
      </div>
    </section>
  );
}
