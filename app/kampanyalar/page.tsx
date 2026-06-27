import type { Metadata } from "next";
import { getFlightDeals } from "@/lib/data";
import { routePrices } from "@/lib/prices";
import KampanyalarClient from "../components/KampanyalarClient";

export const metadata: Metadata = {
  title: "Ucuz Uçak Bileti Kampanyaları",
  description: "Vize türü, bölge ve fiyata göre filtrelenebilir ucuz uçak bileti fırsatları.",
};

const campaignNotes = [
  { title: "Esnek tarih", text: "1-2 gün tarih esnetmek aynı rotada ciddi fiyat farkı yaratabilir." },
  { title: "Alternatif havalimanı", text: "İstanbul için IST/SAW, varışta ise yakın şehir seçenekleri kontrol edilebilir." },
  { title: "Vize maliyeti", text: "Ucuz bilet tek başına yeterli değildir; vize ve şehir içi giderleri de hesaba katılmalı." },
];

export default async function CampaignsPage() {
  let deals = await getFlightDeals();

  // Fiyatları prices.ts'ten al ve eski tarihli olanları pasifleştir
  deals = deals.map(deal => {
    const priceKey = Object.keys(routePrices).find(k => routePrices[k].label === deal.destination);
    const updatedPrice = priceKey ? routePrices[priceKey].fromPrice : deal.price;
    const isExpired = deal.travel_period?.includes("Geçmiş") || deal.travel_period === "İlkbahar - Sonbahar";
    
    return {
      ...deal,
      price: updatedPrice,
      active: !isExpired
    };
  });

  const cheap = deals.filter((deal) => deal.price <= 4000 && deal.active !== false);
  const visaFree = deals.filter((deal) => ["vizesiz", "kimlikle"].includes(deal.visa_type) && deal.active !== false);

  return (
    <section className="l2t-page l2t-wrap">
      <div className="l2t-page-head">
        <p className="l2t-kicker">Kampanyalar</p>
        <h1>Ucuz uçak bileti fırsatları</h1>
        <p>Bölge ve vize türüne göre filtrele, fiyata göre sırala.</p>
      </div>

      {/* İstatistik şeridi */}
      <div className="l2t-stats-strip">
        <div className="l2t-stat-item">
          <strong>{deals.filter(d => d.active !== false).length}</strong>
          <span>Aktif fırsat</span>
        </div>
        <div className="l2t-stat-item">
          <strong>{cheap.length}</strong>
          <span>4.000 TL altı</span>
        </div>
        <div className="l2t-stat-item">
          <strong>{visaFree.length}</strong>
          <span>Vizesiz / kimlikle</span>
        </div>
        <div className="l2t-stat-item">
          <strong>{Array.from(new Set(deals.map((d) => d.region))).length}</strong>
          <span>Bölge</span>
        </div>
      </div>

      {/* Filtreli kampanya listesi */}
      <KampanyalarClient deals={deals} />

      {/* Notlar */}
      <div className="l2t-comparison-grid" style={{ marginTop: "32px" }}>
        {campaignNotes.map((note) => (
          <article className="l2t-comparison-card" key={note.title}>
            <h3>{note.title}</h3>
            <p>{note.text}</p>
          </article>
        ))}
      </div>

      <div className="l2t-soft-band">
        <p><strong>Fiyat notu:</strong> Fiyatlar dönemsel olarak değişebilir. Güncel fiyat için arama yapın. Letsgo2Travel fırsatı öne çıkarır; son fiyatı her zaman yönlendirilen canlı arama ekranında kontrol etmek gerekir.</p>
      </div>
    </section>
  );
}
