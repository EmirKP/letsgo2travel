import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDealBySlug, getFlightDeals } from "@/lib/data";
import { affiliateRedirectUrl, siteSettings, trackedAffiliateUrl } from "@/lib/affiliate";
import JsonLd from "@/app/components/JsonLd";
import { flightDealSchema } from "@/lib/structured-data";

export async function generateStaticParams() {
  const deals = await getFlightDeals();
  return deals.map((deal) => ({ slug: deal.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const deal = await getDealBySlug(slug);
  return {
    title: deal?.title || "Uçak Bileti",
    description: deal
      ? `${deal.origin} → ${deal.destination} uçak bileti fırsatı. ${deal.price.toLocaleString("tr-TR")} ${deal.currency} başlayan fiyatlarla.`
      : "Uçak bileti fırsatı",
  };
}

export default async function FlightDealDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const deal = await getDealBySlug(slug);
  if (!deal) notFound();

  const flightUrl = affiliateRedirectUrl({
    provider: "aviasales",
    url: deal.affiliate_url,
    destination: deal.destination_code || deal.destination,
    sourcePage: `flight_deal_${deal.slug}`,
    campaign: "flight_deal",
  });

  return (
    <section className="l2t-page l2t-wrap">
      <JsonLd data={flightDealSchema(deal)} />
      {/* Hero — light tema uyumlu */}
      <div
        className="l2t-detail-hero"
        style={
          deal.image_url
            ? { backgroundImage: `linear-gradient(90deg, rgba(8,21,51,.94), rgba(8,21,51,.58)), url(${deal.image_url})` }
            : { background: "linear-gradient(135deg, #06183A, #0A2050)" }
        }
      >
        <p className="l2t-kicker" style={{ color: "#FFD15C" }}>
          {deal.region} · {deal.visa_type}
        </p>
        <h1 style={{ color: "#ffffff" }}>{deal.title}</h1>
        <p style={{ color: "rgba(255,255,255,.85)" }}>
          {deal.origin} ({deal.origin_code}) → {deal.destination} ({deal.destination_code})
        </p>
        <div className="l2t-price-line" style={{ color: "#ffffff", fontSize: "2rem", fontWeight: 900, margin: "12px 0 20px" }}>
          {deal.price.toLocaleString("tr-TR")} {deal.currency}
        </div>
        <div className="l2t-hero-actions">
          <a href={flightUrl} target="_blank" rel="nofollow sponsored noreferrer" className="l2t-btn">
            ✈ Canlı fiyatı kontrol et
          </a>
          <a
            href={trackedAffiliateUrl({ provider: "booking", url: siteSettings.bookingAffiliateUrl, destination: deal.destination, sourcePage: `flight_deal_${deal.slug}` })}
            target="_blank"
            rel="nofollow sponsored noreferrer"
            className="l2t-btn l2t-btn-ghost"
            style={{ color: "#ffffff", borderColor: "rgba(255,255,255,.28)" }}
          >
            🏨 Otel bul
          </a>
        </div>
      </div>

      {/* Detay bilgileri */}
      <div className="l2t-info-grid">
        <article className="l2t-info-card">
          <span>✈ Havayolu</span>
          <strong>{deal.airline || "Çoklu seçenek"}</strong>
        </article>
        <article className="l2t-info-card">
          <span>📅 Dönem</span>
          <strong>{deal.travel_period || "Esnek"}</strong>
        </article>
        <article className="l2t-info-card">
          <span>🔄 Tip</span>
          <strong>{deal.trip_type || "Gidiş dönüş"}</strong>
        </article>
        <article className="l2t-info-card">
          <span>🛂 Vize</span>
          <strong>{deal.visa_type}</strong>
        </article>
      </div>

      {/* Affiliate kartlar */}
      <div className="l2t-card-grid l2t-card-grid-3" style={{ marginTop: "24px" }}>
        <a className="l2t-card l2t-affiliate-card" href={flightUrl} target="_blank" rel="nofollow sponsored noreferrer">
          <div className="l2t-card-icon">✈</div>
          <h3>Uçuşu ara</h3>
          <p>Aviasales üzerinden {deal.origin} → {deal.destination} için canlı fiyatları gör.</p>
          <span className="l2t-btn l2t-btn-small">Canlı fiyat →</span>
        </a>

        <a
          className="l2t-card l2t-affiliate-card"
          href={trackedAffiliateUrl({ provider: "booking", url: siteSettings.bookingAffiliateUrl, destination: deal.destination, sourcePage: `flight_deal_${deal.slug}` })}
          target="_blank"
          rel="nofollow sponsored noreferrer"
        >
          <div className="l2t-card-icon">🏨</div>
          <h3>Otel bul</h3>
          <p>{deal.destination} için konaklama seçeneklerini karşılaştır.</p>
          <span className="l2t-btn l2t-btn-small">Otellere bak →</span>
        </a>

        <a
          className="l2t-card l2t-affiliate-card"
          href={trackedAffiliateUrl({ provider: "airalo", url: siteSettings.airaloAffiliateUrl, destination: deal.destination, sourcePage: `flight_deal_${deal.slug}` })}
          target="_blank"
          rel="nofollow sponsored noreferrer"
        >
          <div className="l2t-card-icon">📶</div>
          <h3>eSIM al</h3>
          <p>Varıştan önce internet paketini hazırla, havalimanında hemen bağlan.</p>
          <span className="l2t-btn l2t-btn-small">eSIM al →</span>
        </a>
      </div>

      <p className="l2t-disclaimer" style={{ marginTop: "16px" }}>
        Fiyatlar anlık değişebilir. Canlı arama ekranında son fiyatı kontrol et.
        Letsgo2Travel, Travelpayouts iş ortağı olarak komisyon kazanabilir.
      </p>

      <div style={{ marginTop: "16px" }}>
        <Link href="/kampanyalar" className="l2t-text-link">← Tüm kampanyalara dön</Link>
      </div>
    </section>
  );
}
