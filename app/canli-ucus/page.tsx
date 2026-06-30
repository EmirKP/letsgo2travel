import type { Metadata } from "next";
import Link from "next/link";
import FlightSearchCard from "../components/FlightSearchCard";
import { getFlightDeals } from "@/lib/data";
import { affiliateRedirectUrl } from "@/lib/affiliate";

export const metadata: Metadata = {
  title: "Canlı Uçuş Arama — Ucuz Bilet Bul",
  description: "Yüzlerce havayolu ve partner fiyatını anında karşılaştır. IST ve SAW çıkışlı en ucuz uçuşları bul.",
};

export default async function LiveFlightsPage() {
  const deals = await getFlightDeals();
  const cheapest = [...deals].sort((a, b) => a.price - b.price).slice(0, 3);

  return (
    <section className="l2t-page l2t-wrap">
      <div className="l2t-page-head">
        <p className="l2t-kicker">Uçak bileti arama</p>
        <h1>Yüzlerce fiyatı anında karşılaştır</h1>
        <p>
          Aviasales iş ortaklığıyla IST, SAW ve ESB çıkışlı güncel uçuş fiyatlarını tek ekranda görüntüle.
        </p>
      </div>

      {/* Ana arama kutusu */}
      <FlightSearchCard />

      {/* Hızlı rota kartları */}
      <div style={{ marginTop: "28px" }}>
        <div className="l2t-section-head">
          <div>
            <p className="l2t-kicker">Bu hafta öne çıkanlar</p>
            <h2>En ucuz fırsatlar</h2>
          </div>
          <Link href="/kampanyalar" className="l2t-text-link">Tümünü gör →</Link>
        </div>
        <div className="l2t-card-grid l2t-card-grid-3">
          {cheapest.map((deal) => (
            <a
              key={deal.id}
              href={affiliateRedirectUrl({ provider: "aviasales", url: deal.affiliate_url, destination: deal.destination_code || deal.destination, sourcePage: "live_flights", campaign: "live_flights" })}
              target="_blank"
              rel="nofollow sponsored noreferrer"
              className="l2t-card"
              style={{ display: "block", textDecoration: "none" }}
            >
              <div
                className="l2t-card-image"
                style={{ backgroundImage: `url(${deal.image_url || "/travel-images/route-generic.jpg"})` }}
              />
              <div className="l2t-card-body">
                <div className="l2t-card-topline">
                  <span>{deal.region}</span>
                  <span>{deal.visa_type}</span>
                </div>
                <h3>{deal.title}</h3>
                <p>{deal.origin_code} → {deal.destination_code} · {deal.travel_period || "Esnek tarih"}</p>
                <div className="l2t-deal-bottom">
                  <strong>{deal.price.toLocaleString("tr-TR")} {deal.currency}</strong>
                  <span className="l2t-btn l2t-btn-small">Ara →</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* İpuçları */}
      <div className="l2t-trust-strip" style={{ marginTop: "24px" }}>
        <article>
          <span>💡</span>
          <div>
            <h3>Esnek tarih dene</h3>
            <p>1–2 gün oynamak aynı rotada %20–30 fiyat farkı yaratabilir.</p>
          </div>
        </article>
        <article>
          <span>✈</span>
          <div>
            <h3>IST ve SAW karşılaştır</h3>
            <p>İki farklı İstanbul havalimanı çoğu zaman farklı fiyatlar gösterir.</p>
          </div>
        </article>
        <article>
          <span>🔔</span>
          <div>
            <h3>Fiyat alarmı kur</h3>
            <p>Fiyat düşünce haberdar olmak için <Link href="/fiyat-kontrolu" className="l2t-text-link">alarm oluştur</Link>.</p>
          </div>
        </article>
      </div>

      <p className="l2t-disclaimer" style={{ marginTop: "16px" }}>
        Fiyatlar anlık değişebilir. Buton tıklandığında Aviasales üzerinden canlı arama yapılır.
        Letsgo2Travel, Travelpayouts iş ortağı olarak komisyon kazanabilir.
      </p>
    </section>
  );
}
