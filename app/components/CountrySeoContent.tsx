import Link from "next/link";
import { AlertTriangle, BellRing, CheckCircle2, CircleDollarSign, HelpCircle, MapPinned, Plane, ShieldCheck } from "lucide-react";
import type { CountryGuide } from "@/lib/types";
import { getCountrySeoContent } from "@/lib/country-seo-content";

export default function CountrySeoContent({ country }: { country: CountryGuide }) {
  const content = getCountrySeoContent(country);
  const priceAlertHref = `/fiyat-kontrolu?to=${encodeURIComponent(country.airport_code || country.country_name)}`;
  const flightHref = `/ucak-bileti-ara?to=${encodeURIComponent(country.airport_code || country.country_name)}`;
  const forumHref = `/forum/ulke/${country.slug}`;

  return (
    <section className="l2t-wrap l2t-country-seo-block" aria-labelledby="country-seo-title">
      <div className="l2t-country-seo-head">
        <p className="l2t-kicker">Google rehberi</p>
        <h2 id="country-seo-title">{content.searchTitle}</h2>
        <p>{content.intro}</p>
      </div>

      <div className="l2t-country-seo-grid">
        <article className="l2t-country-seo-card l2t-country-seo-card-main">
          <span><ShieldCheck size={22} /></span>
          <h3>Kimler için uygun?</h3>
          <ul>
            {content.bestFor.map((item) => <li key={item}><CheckCircle2 size={15} /> {item}</li>)}
          </ul>
        </article>

        <article className="l2t-country-seo-card">
          <span><MapPinned size={22} /></span>
          <h3>Gitmeden önce</h3>
          <ul>
            {content.beforeYouGo.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>

        <article className="l2t-country-seo-card">
          <span><CircleDollarSign size={22} /></span>
          <h3>Bütçe ipuçları</h3>
          <ul>
            {content.budgetTips.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>

        <article className="l2t-country-seo-card">
          <span><Plane size={22} /></span>
          <h3>Sahada işine yarar</h3>
          <ul>
            {content.localTips.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>
      </div>

      <div className="l2t-country-seo-faq" aria-label={`${country.country_name} sık sorulan sorular`}>
        <div className="l2t-country-seo-faq-head">
          <HelpCircle size={20} />
          <h3>{country.country_name} hakkında sık sorulan sorular</h3>
        </div>
        <div className="l2t-country-seo-faq-list">
          {content.faq.map((faq) => (
            <details key={faq.question}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>

      <div className="l2t-country-seo-cta-strip">
        <Link href={flightHref}><Plane size={16} /> Uçak bileti ara</Link>
        <Link href={priceAlertHref}><BellRing size={16} /> Fiyat alarmı kur</Link>
        <Link href={forumHref}><MapPinned size={16} /> Gezgin yorumlarını oku</Link>
      </div>

      <div className="l2t-country-seo-warning">
        <AlertTriangle size={17} />
        <p>Vize, kimlikle giriş ve kalış süresi kuralları değişebilir. Bu rehber karar vermeni kolaylaştırmak içindir; seyahatten önce resmi kurumları, havayolunu ve güncel sınır kurallarını kontrol et.</p>
      </div>
    </section>
  );
}
